# Evaluation: false approvals

## Question

When the After image is fake, how often does Proofline give the task a Strong score (85 or higher)?

## Method

1. Use one real Before photo of a place or item.
2. Create one or more fake “completed” After images with Muse Image. Do not present these as real work.
3. Put the real image at `eval_set/before.jpg` and the fake images under `eval_set/fakes/`.
4. Run the evaluation script against the backend with the real scoring model enabled:

   ```bash
   python scripts/eval_false_approval.py \
     --api http://localhost:8000 \
     --email worker@example.com \
     --password 'your-password' \
     --dir eval_set \
     --out eval_result.json
   ```

5. Record the number of images, scored pairs, Strong scores, and false-approval rate below. Unscored pairs are reported separately and are not counted as passes.

The script creates a work order, task, checklist requirement, evidence files and score job for every fake image. These records remain in the database, so use a disposable evaluation database or clearly labeled test account.

## Results

Run date: __

- Images: __
- Scored: __
- Strong scores (false approvals): __
- False-approval rate: __ %
- Model and version: __

## Limits

- The set is small and created by us. It does not measure real-world fraud rates.
- The score is advice. A person still decides, so a high score alone approves nothing.
- `MODEL_MOCK=true` produces sample numbers only. Do not report mock-mode output as an evaluation result.
- Record the model and version used so results can be interpreted later.
