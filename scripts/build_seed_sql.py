#!/usr/bin/env python3
"""把 data/questions/*.json 轉成 supabase/seed/*.sql（upsert 到 public.questions）。

用法：python3 scripts/build_seed_sql.py
產出：supabase/seed/questions_<file>.sql，可在 Supabase SQL Editor 直接執行，重複執行會覆寫同 id 題目。
"""
import json, glob, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "questions"
OUT = ROOT / "supabase" / "seed"
OUT.mkdir(parents=True, exist_ok=True)

VALID_DIMS = set()
syll = json.load(open(ROOT / "data" / "syllabus.json", encoding="utf-8"))
topic_dim = {}
for lvl in syll["levels"].values():
    for d in lvl["dimensions"]:
        VALID_DIMS.add(d["key"])
        for t in d["topics"]:
            topic_dim[t] = d["key"]


def q(s: str) -> str:
    """dollar-quote a string safely."""
    tag = "$q$"
    while tag in s:
        tag = tag[:-1] + "x$"
    return f"{tag}{s}{tag}"


def arr(xs):
    return "ARRAY[" + ",".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"


total = 0
for f in sorted(SRC.glob("*.json")):
    rows = json.load(open(f, encoding="utf-8"))
    values = []
    for r in rows:
        assert r["answer"] in r["options"], r["id"]
        assert set(r["option_analysis"]) == {"A", "B", "C", "D"}, r["id"]
        assert topic_dim[r["topic"]] == r["dimension"], (r["id"], r["topic"], r["dimension"])
        values.append("(" + ",".join([
            q(r["id"]), q(r["level"]), q(r["subject"]), q(r["topic"]), q(r["indicator"]), q(r["dimension"]),
            str(int(r["difficulty"])), q(r["question"]),
            q(json.dumps(r["options"], ensure_ascii=False)) + "::jsonb",
            q(r["answer"]), q(r["explanation"]),
            q(json.dumps(r["option_analysis"], ensure_ascii=False)) + "::jsonb",
            arr(r.get("keywords", [])), q(r.get("source_hint", "") or ""),
        ]) + ")")
    sql = (
        "insert into public.questions (id, level, subject, topic, indicator, dimension, difficulty, question, options, answer, explanation, option_analysis, keywords, source_hint)\nvalues\n"
        + ",\n".join(values)
        + "\non conflict (id) do update set level=excluded.level, subject=excluded.subject, topic=excluded.topic, indicator=excluded.indicator, dimension=excluded.dimension, difficulty=excluded.difficulty, question=excluded.question, options=excluded.options, answer=excluded.answer, explanation=excluded.explanation, option_analysis=excluded.option_analysis, keywords=excluded.keywords, source_hint=excluded.source_hint, active=true;\n"
    )
    out = OUT / f"questions_{f.stem}.sql"
    out.write_text(sql, encoding="utf-8")
    total += len(rows)
    print(out.name, len(rows), "rows", len(sql), "bytes")
print("total", total)
