// Handwriting -> text via the native Windows engine (Windows Ink Analysis /
// InkAnalyzer). Runs IN-PROCESS inside the Tauri app (which has a real window),
// so no separate headless helper is needed. The front-end sends absolute stroke
// points; we build InkStrokes, analyse them, and return the recognized text.
//
// Block-aware & granularity-selectable: Ink Analysis groups strokes into a tree
// (writing regions -> paragraphs -> lines -> words) and flags non-text strokes
// as drawings. We return one TextBlock per node at the requested granularity --
// default "line" (each line replaced in place, best size/position fidelity),
// with "paragraph"/"region" available for A/B testing. Each block carries its
// recognized text, bounding rectangle, and which input strokes it consumed, so
// the front-end drops the text back where that ink was and leaves drawings alone.

/// One recognized block of text and where it sat. `stroke_indices` index into
/// the `strokes` array the front-end sent. Coordinates are in the same space the
/// caller sent (the app sends absolute scene coordinates).
#[derive(serde::Serialize, Debug)]
pub struct TextBlock {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub stroke_indices: Vec<usize>,
}

#[cfg(windows)]
mod imp {
    use super::TextBlock;
    use std::cell::Cell;
    use std::collections::{HashMap, HashSet};
    use windows::core::{implement, Error, Interface, Result};
    use windows::Foundation::Point;
    use windows_collections::{IIterable, IIterable_Impl, IIterator, IIterator_Impl};
    use windows::UI::Input::Inking::Analysis::{
        IInkAnalysisNode, InkAnalysisLine, InkAnalysisNodeKind, InkAnalysisParagraph,
        InkAnalysisWritingRegion, InkAnalyzer,
    };
    use windows::UI::Input::Inking::InkStrokeBuilder;
    use windows::Win32::Foundation::E_BOUNDS;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    // A minimal IIterable<Point> so we can pass Rust points to CreateStroke,
    // which takes IIterable<Point>. windows-rs has no Vec -> collection helper.
    #[implement(IIterable<Point>)]
    struct PointList(Vec<Point>);

    impl IIterable_Impl<Point> for PointList_Impl {
        fn First(&self) -> Result<IIterator<Point>> {
            Ok(PointCursor {
                items: self.0.clone(),
                pos: Cell::new(0),
            }
            .into())
        }
    }

    #[implement(IIterator<Point>)]
    struct PointCursor {
        items: Vec<Point>,
        pos: Cell<usize>,
    }

    impl IIterator_Impl<Point> for PointCursor_Impl {
        fn Current(&self) -> Result<Point> {
            self.items
                .get(self.pos.get())
                .copied()
                .ok_or_else(|| Error::from(E_BOUNDS))
        }
        fn HasCurrent(&self) -> Result<bool> {
            Ok(self.pos.get() < self.items.len())
        }
        fn MoveNext(&self) -> Result<bool> {
            let n = self.pos.get() + 1;
            self.pos.set(n);
            Ok(n < self.items.len())
        }
        fn GetMany(&self, items: &mut [Point]) -> Result<u32> {
            let start = self.pos.get();
            let mut count = 0usize;
            while count < items.len() {
                match self.items.get(start + count) {
                    Some(p) => {
                        items[count] = *p;
                        count += 1;
                    }
                    None => break,
                }
            }
            self.pos.set(start + count);
            Ok(count as u32)
        }
    }

    // Recognized text off a node, casting to the concrete type for the kind.
    fn node_text(node: &IInkAnalysisNode, kind: InkAnalysisNodeKind) -> Result<String> {
        let s = match kind {
            InkAnalysisNodeKind::Line => node.cast::<InkAnalysisLine>()?.RecognizedText()?,
            InkAnalysisNodeKind::Paragraph => {
                node.cast::<InkAnalysisParagraph>()?.RecognizedText()?
            }
            _ => node.cast::<InkAnalysisWritingRegion>()?.RecognizedText()?,
        };
        Ok(s.to_string())
    }

    fn kind_for(granularity: &str) -> InkAnalysisNodeKind {
        match granularity {
            "paragraph" => InkAnalysisNodeKind::Paragraph,
            "region" => InkAnalysisNodeKind::WritingRegion,
            _ => InkAnalysisNodeKind::Line,
        }
    }

    fn analyze(strokes: Vec<Vec<[f64; 2]>>, granularity: &str) -> Result<Vec<TextBlock>> {
        // Initialise WinRT on this thread (harmless if already initialised).

        let builder = InkStrokeBuilder::new()?;
        let analyzer = InkAnalyzer::new()?;

        // Map each analyzer-assigned stroke id back to its index in the input.
        let mut id_to_index: HashMap<u32, usize> = HashMap::new();

        for (idx, stroke) in strokes.iter().enumerate() {
            if stroke.len() < 2 {
                continue; // a single dot is not a recognisable stroke
            }
            let pts: Vec<Point> = stroke
                .iter()
                .map(|p| Point {
                    X: p[0] as f32,
                    Y: p[1] as f32,
                })
                .collect();
            let iterable: IIterable<Point> = PointList(pts).into();
            let ink_stroke = builder.CreateStroke(&iterable)?;
            id_to_index.insert(ink_stroke.Id()?, idx);
            analyzer.AddDataForStroke(&ink_stroke)?;
        }

        // The dedicated recognition worker owns this blocking Windows operation.
        analyzer.AnalyzeAsync()?.get()?;
        let root = analyzer.AnalysisRoot()?;

        // Only consume strokes that belong to actual InkWord nodes.
        // A line/paragraph rectangle can enclose drawings or unclassified ink.
        let words = root.FindNodes(InkAnalysisNodeKind::InkWord)?;
        let mut writing_ids: HashSet<u32> = HashSet::new();
        for i in 0..words.Size()? {
            let ids = words.GetAt(i)?.GetStrokeIds()?;
            for j in 0..ids.Size()? {
                writing_ids.insert(ids.GetAt(j)?);
            }
        }
        let drawings = root.FindNodes(InkAnalysisNodeKind::InkDrawing)?;
        for i in 0..drawings.Size()? {
            let ids = drawings.GetAt(i)?.GetStrokeIds()?;
            for j in 0..ids.Size()? {
                writing_ids.remove(&ids.GetAt(j)?);
            }
        }

        let kind = kind_for(granularity);
        let mut blocks: Vec<TextBlock> = Vec::new();
        let nodes = root.FindNodes(kind)?;
        for i in 0..nodes.Size()? {
            let node = nodes.GetAt(i)?;
            let text = node_text(&node, kind)?;
            if text.trim().is_empty() {
                continue;
            }
            let ids = node.GetStrokeIds()?;
            let mut stroke_indices: Vec<usize> = Vec::new();
            for j in 0..ids.Size()? {
                let id = ids.GetAt(j)?;
                if writing_ids.contains(&id) {
                    if let Some(&idx) = id_to_index.get(&id) {
                        stroke_indices.push(idx);
                    }
                }
            }
            if stroke_indices.is_empty() { continue; }
            // Measure only the writing we will consume. An enclosing line's
            // box can include a drawing that would inflate the shared font size.
            let mut left = f64::INFINITY;
            let mut top = f64::INFINITY;
            let mut right = f64::NEG_INFINITY;
            let mut bottom = f64::NEG_INFINITY;
            for idx in &stroke_indices {
                for point in &strokes[*idx] {
                    left = left.min(point[0]);
                    top = top.min(point[1]);
                    right = right.max(point[0]);
                    bottom = bottom.max(point[1]);
                }
            }
            blocks.push(TextBlock {
                text,
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
                stroke_indices,
            });
        }

        // No root-wide fallback: it would claim all input strokes, including
        // drawings. Unclassified ink stays on the canvas for a clearer retry.

        Ok(blocks)
    }

    pub fn recognize(
        strokes: Vec<Vec<[f64; 2]>>,
        granularity: &str,
    ) -> std::result::Result<Vec<TextBlock>, String> {
        // Ink Analysis keeps process resources beyond an individual call. Keep
        // all recognizers on one long-lived Windows apartment, including tests.
        // This avoids tearing down one apartment while the next request starts.
        type Reply = std::sync::mpsc::Sender<std::result::Result<Vec<TextBlock>, String>>;
        type Request = (Vec<Vec<[f64; 2]>>, String, Reply);
        static WORKER: std::sync::OnceLock<std::sync::mpsc::Sender<Request>> = std::sync::OnceLock::new();
        let worker = WORKER.get_or_init(|| {
            let (send, receive) = std::sync::mpsc::channel::<Request>();
            std::thread::spawn(move || {
                let apartment = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|e| e.to_string());
                for (strokes, mode, reply) in receive {
                    let result = match &apartment {
                        Ok(()) => analyze(strokes, &mode).map_err(|e| e.to_string()),
                        Err(error) => Err(error.clone()),
                    };
                    let _ = reply.send(result);
                }
            });
            send
        });
        let (reply, receive) = std::sync::mpsc::channel();
        worker.send((strokes, granularity.to_string(), reply)).map_err(|_| "Windows handwriting worker stopped".to_string())?;
        receive.recv().map_err(|_| "Windows handwriting worker did not return a result".to_string())?
    }
}

#[cfg(not(windows))]
mod imp {
    use super::TextBlock;
    pub fn recognize(
        _strokes: Vec<Vec<[f64; 2]>>,
        _granularity: &str,
    ) -> std::result::Result<Vec<TextBlock>, String> {
        Err("Handwriting recognition is only available in the Windows desktop app.".into())
    }
}

/// Tauri command invoked from the front-end with absolute stroke points and a
/// granularity ("line" | "paragraph" | "region"; default "line").
#[tauri::command]
pub async fn recognize_handwriting(
    strokes: Vec<Vec<[f64; 2]>>,
    granularity: Option<String>,
) -> Result<Vec<TextBlock>, String> {
    let g = granularity.unwrap_or_else(|| "line".to_string());
    tauri::async_runtime::spawn_blocking(move || imp::recognize(strokes, &g)).await.map_err(|e| e.to_string())?
}

// Smoke test: confirms the whole Windows Ink Analysis pipeline runs end to end
// (apartment init, build strokes, AnalyzeAsync, walk the tree) without erroring.
#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn ink_analysis_pipeline_runs() {
        let s1: Vec<[f64; 2]> = (0..30).map(|i| [10.0 + i as f64 * 4.0, 50.0 + (i as f64 * 0.4).sin() * 15.0]).collect();
        let s2: Vec<[f64; 2]> = (0..20).map(|i| [140.0 + i as f64 * 4.0, 50.0 + (i as f64 * 0.5).cos() * 12.0]).collect();
        let out = super::imp::recognize(vec![s1, s2], "line");
        println!("recognize() -> {} block(s)", out.as_ref().map(|b| b.len()).unwrap_or(0));
        assert!(out.is_ok(), "InkAnalyzer pipeline errored: {out:?}");
    }
    #[test]
    fn saved_synthetic_corpus_runs_line_and_paragraph() {
        for (name, json) in [
            ("drawing-box", include_str!("../../tests/fixtures/drawing-box.json")),
            ("pause-bars", include_str!("../../tests/fixtures/pause-bars.json")),
        ] {
            let fixture: serde_json::Value=serde_json::from_str(json).unwrap();
            let strokes: Vec<Vec<[f64;2]>>=serde_json::from_value(fixture["strokes"].clone()).unwrap();
            for mode in ["line","paragraph"] {
                let start=std::time::Instant::now();
                let blocks=super::imp::recognize(strokes.clone(),mode).unwrap();
                for b in &blocks { assert!(b.stroke_indices.iter().all(|i| *i<strokes.len()));assert!(b.x.is_finite()&&b.y.is_finite()); }
                println!("synthetic {name} {mode}: {}ms, {:?}",start.elapsed().as_millis(),blocks.iter().map(|b| &b.text).collect::<Vec<_>>());
            }
        }
    }

}
