# 題庫 JSON 格式

每個檔案為一個 JSON 陣列，每題結構如下（所有欄位必填，繁體中文）：

```json
{
  "id": "L11-001",
  "level": "L1",
  "subject": "L11",
  "topic": "L111",
  "indicator": "L11101",
  "dimension": "ai_concept",
  "difficulty": 2,
  "question": "下列何者最能描述「弱人工智慧」？",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "B",
  "explanation": "整體解析：為何這題的正確觀念是……（2～4 句）",
  "option_analysis": {
    "A": "為何不對：……（指出此選項對應的誤解）",
    "B": "正確：……",
    "C": "為何不對：……",
    "D": "為何不對：……"
  },
  "keywords": ["弱AI", "狹義AI"],
  "source_hint": "L11101 人工智慧的定義、分類與發展"
}
```

規則：
- `id`：`{subject}-{三位流水號}`，同一檔案內不可重複。
- `level`：`L1` 初級、`L2` 中級。
- `topic` / `indicator` / `dimension` 必須對應 `data/syllabus.json` 內的代碼（dimension 依 topic 所屬的 dimensions 設定）。
- `difficulty`：1 基礎記憶、2 理解應用、3 情境判斷。
- 四個選項長度相近、只有一個正確答案；正確答案在 A/B/C/D 均勻分布。
- `option_analysis` 每個選項都要有一句以上的說明，錯誤選項要點出「這個選項是哪種常見誤解」。
- 題目必須是原創，不可抄襲任何網路題庫或官方試題。
