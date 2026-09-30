import test from "node:test";
import assert from "node:assert/strict";
import { readFields, withFields, normalizeFields } from "../src/lib.js";
import {
  filterItems,
  budgetLabel,
  deadlineDays,
  parseBudgetRange,
  budgetRangeLabel,
} from "../src/lib.js";

const projects = [
  {
    id: "a",
    title: "포스터 제작",
    category: "디자인",
    service: "포스터",
    tags: ["Figma"],
    budget: 100000,
    days: 7,
    mode: "온라인",
    status: "OPEN",
    deadline: "2099-10-03",
    createdAt: "2026-09-30",
  },
  {
    id: "b",
    title: "로고 제작",
    category: "디자인",
    tags: ["Illustrator"],
    budget: 300000,
    days: 14,
    mode: "혼합",
    status: "OPEN",
    deadline: "2099-10-01",
    createdAt: "2026-09-29",
  },
  {
    id: "c",
    title: "웹 개발",
    category: "개발·IT",
    tags: ["React"],
    budget: 500000,
    days: 20,
    mode: "온라인",
    status: "OPEN",
    deadline: "2099-10-05",
    createdAt: "2026-09-28",
  },
  {
    id: "d",
    title: "취소된 포스터",
    category: "디자인",
    tags: [],
    budget: 50000,
    status: "CANCELLED",
  },
];
test("분야 간 OR 선택과 다른 필터의 AND 적용, 기존 링크 호환", () => {
  const data = [
    { id: "logo", category: "디자인", service: "로고 디자인", budget: 100000 },
    {
      id: "poster",
      category: "디자인",
      service: "포스터·인쇄물",
      budget: 100000,
    },
    { id: "front", category: "개발·IT", service: "프론트엔드", budget: 200000 },
    { id: "back", category: "개발·IT", service: "백엔드", budget: 300000 },
    { id: "other", category: "기타", service: "로고 디자인", budget: 100000 },
  ];
  const fields = [
    { category: "디자인", service: "로고 디자인" },
    { category: "개발·IT", service: "프론트엔드" },
    { category: "개발·IT", service: "백엔드" },
  ];
  const params = withFields(
    new URLSearchParams("page=3&sort=budget&budgetMax=200000"),
    fields,
  );
  assert.equal(params.has("page"), false);
  assert.equal(params.get("sort"), "budget");
  assert.deepEqual(readFields(params), fields);
  assert.deepEqual(
    filterItems(data, params, "projects").map((p) => p.id),
    ["front", "logo"],
  );
  assert.deepEqual(
    filterItems(
      data,
      withFields(new URLSearchParams(), [
        { category: "디자인", service: null },
        fields[1],
      ]),
      "projects",
    ).map((p) => p.id),
    ["logo", "poster", "front"],
  );
  assert.deepEqual(
    filterItems(
      data,
      new URLSearchParams("category=디자인&service=로고 디자인"),
      "projects",
    ).map((p) => p.id),
    ["logo"],
  );
  assert.deepEqual(
    normalizeFields([
      ...fields,
      { category: "디자인", service: null },
      fields[1],
    ]),
    [fields[1], fields[2], { category: "디자인", service: null }],
  );
});
test("직접 입력 예산의 양끝, 한쪽 범위 및 입력 오류 처리", () => {
  assert.deepEqual(
    filterItems(
      projects,
      new URLSearchParams("budgetMin=100000&budgetMax=300000"),
      "projects",
    ).map((p) => p.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filterItems(
      projects,
      new URLSearchParams("budgetMin=300001"),
      "projects",
    ).map((p) => p.id),
    ["c"],
  );
  assert.deepEqual(
    filterItems(
      projects,
      new URLSearchParams("budgetMax=100000"),
      "projects",
    ).map((p) => p.id),
    ["a"],
  );
  assert.deepEqual(
    filterItems(projects, new URLSearchParams("budgetMax=0"), "projects"),
    [],
  );
  assert.equal(parseBudgetRange("100,000", "300,000").min, 100000);
  for (const [min, max] of [
    ["200", "100"],
    ["-1", ""],
    ["abc", ""],
    ["", "1.5"],
    ["Infinity", ""],
  ])
    assert.ok(parseBudgetRange(min, max).error);
  assert.equal(budgetRangeLabel(parseBudgetRange("0", "")), "예산 0원 이상");
  assert.equal(
    budgetRangeLabel(parseBudgetRange("", "80000")),
    "예산 80,000원 이하",
  );
});
test("범위형 프로젝트는 검색 예산과 겹치는 경우 포함하고 협의는 제외한다", () => {
  const items = [
    { id: "range", budgetType: "범위", budget: 100000, budgetMax: 200000 },
    { id: "negotiable", budgetType: "협의", budget: 0 },
  ];
  assert.deepEqual(
    filterItems(
      items,
      new URLSearchParams("budgetMin=150000&budgetMax=250000"),
      "projects",
    ).map((p) => p.id),
    ["range"],
  );
  assert.deepEqual(
    filterItems(items, new URLSearchParams("budgetMin=200001"), "projects"),
    [],
  );
});
test("복합 필터와 기술 검색으로 프로젝트를 제한한다", () => {
  assert.deepEqual(
    filterItems(
      projects,
      new URLSearchParams("category=디자인&budget=10만원 이하&mode=온라인"),
      "projects",
    ).map((p) => p.id),
    ["a"],
  );
  assert.deepEqual(
    filterItems(projects, new URLSearchParams("q=react"), "projects").map(
      (p) => p.id,
    ),
    ["c"],
  );
  assert.equal(
    filterItems(
      projects,
      new URLSearchParams("q=존재하지않는검색어"),
      "projects",
    ).length,
    0,
  );
});
test("마감과 예산 정렬을 적용하고 취소된 공고를 제외한다", () => {
  assert.deepEqual(
    filterItems(projects, new URLSearchParams("sort=budget"), "projects").map(
      (p) => p.id,
    ),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    filterItems(projects, new URLSearchParams("sort=deadline"), "projects").map(
      (p) => p.id,
    ),
    ["b", "a", "c"],
  );
});
test("전문가 조건은 실제로 목록을 필터링한다", () => {
  const experts = [
    { id: 1, rating: 4.9, available: true, completed: 20 },
    { id: 2, rating: 4.7, available: false, completed: 8 },
  ];
  assert.deepEqual(
    filterItems(
      experts,
      new URLSearchParams("available=1&rating=4.8&completed=10"),
      "experts",
    ).map((e) => e.id),
    [1],
  );
});
test("고정 금액·범위·협의 예산 표시", () => {
  assert.equal(budgetLabel({ budget: 100000 }), "100,000원");
  assert.equal(
    budgetLabel({ budgetType: "범위", budget: 100000, budgetMax: 200000 }),
    "100,000~200,000원",
  );
  assert.equal(budgetLabel({ budgetType: "협의" }), "협의");
  assert.equal(deadlineDays("2020-01-01", new Date("2026-01-01")), 0);
  assert.equal(deadlineDays("2026-10-05", new Date("2026-09-30T13:00:00")), 5);
  assert.equal(deadlineDays("2026-09-30", new Date("2026-09-30T13:00:00")), 0);
});
