import { useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { categories, services } from "./data";
import {
  readFields,
  withFields,
  normalizeFields,
  filterItems,
  fieldLabel,
} from "./lib";

export default function FieldFilter({
  params,
  items,
  type,
  onApply,
  onCancel,
  onEdit,
}) {
  const [selected, setSelected] = useState(() => readFields(params));
  const [active, setActive] = useState(
    () => readFields(params)[0]?.category || "디자인",
  );
  const allServices = Object.values(services[active] || {}).flat();
  const whole = selected.some(
    (field) => field.category === active && !field.service,
  );
  const children = selected.filter(
    (field) => field.category === active && field.service,
  );
  const count = filterItems(items, withFields(params, selected), type).length;
  const change = (next) => {
    onEdit();
    setSelected(normalizeFields(next));
  };
  const toggleWhole = () =>
    change(
      whole
        ? selected.filter((field) => field.category !== active)
        : [
            ...selected.filter((field) => field.category !== active),
            { category: active, service: null },
          ],
    );
  const toggleService = (service) => {
    if (whole) {
      change([
        ...selected.filter((field) => field.category !== active),
        ...allServices
          .filter((item) => item !== service)
          .map((item) => ({ category: active, service: item })),
      ]);
    } else if (children.some((field) => field.service === service)) {
      change(
        selected.filter(
          (field) => !(field.category === active && field.service === service),
        ),
      );
    } else {
      change([...selected, { category: active, service }]);
    }
  };
  return (
    <div className="field-picker">
      <div className="field-picker-heading">
        <div>
          <h3>함께 찾아볼 분야를 선택하세요</h3>
          <p>다른 분야의 작업도 여러 개 선택할 수 있어요.</p>
        </div>
        <button
          className="icon-button"
          aria-label="분야 선택 닫기"
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </div>
      <div className="field-picker-body">
        <div className="mega-categories" aria-label="분야 탐색">
          {categories.slice(1).map((category) => {
            const chosen = selected.filter(
              (field) => field.category === category,
            );
            return (
              <button
                key={category}
                type="button"
                className={active === category ? "active" : ""}
                aria-pressed={active === category}
                onMouseEnter={() => {
                  if (
                    matchMedia("(min-width: 768px) and (hover: hover)").matches
                  )
                    setActive(category);
                }}
                onClick={() => setActive(category)}
              >
                <span>{category}</span>
                {chosen.length > 0 && (
                  <span className="field-count">
                    {chosen.some((field) => !field.service)
                      ? "전체"
                      : chosen.length}
                  </span>
                )}
                <ChevronRight size={13} />
              </button>
            );
          })}
        </div>
        <div className="field-picker-services">
          <label className="field-whole">
            <input
              type="checkbox"
              checked={whole}
              ref={(node) => {
                if (node) node.indeterminate = !whole && children.length > 0;
              }}
              onChange={toggleWhole}
            />
            <strong>{active} 전체</strong>
            <span>이 분야의 모든 작업</span>
          </label>
          <div className="mega-columns">
            {Object.entries(services[active] || {}).map(([group, options]) => (
              <div key={group}>
                <h4>{group}</h4>
                {options.map((service) => (
                  <label className="field-service" key={service}>
                    <input
                      type="checkbox"
                      checked={
                        whole ||
                        children.some((field) => field.service === service)
                      }
                      onChange={() => toggleService(service)}
                    />
                    <span>{service}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="field-picker-footer">
        <div className="field-selection-heading">
          <b>선택한 분야 {selected.length}개</b>
          <button className="text-button" onClick={() => change([])}>
            선택 초기화
          </button>
        </div>
        <div className="field-selection" aria-label="선택한 분야">
          {selected.length ? (
            selected.map((field) => (
              <button
                key={JSON.stringify(field)}
                onClick={() =>
                  change(selected.filter((item) => item !== field))
                }
              >
                {fieldLabel(field)}
                <X size={13} />
              </button>
            ))
          ) : (
            <span>선택하지 않으면 모든 분야에서 찾아요.</span>
          )}
        </div>
        <div className="field-picker-actions">
          <small>선택한 분야 중 하나라도 해당하는 결과</small>
          <button className="btn outline" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn primary"
            onClick={() => onApply(withFields(params, selected))}
          >
            <Check size={16} />
            결과 {count}
            {type === "experts" ? "명" : "건"} 보기
          </button>
        </div>
      </div>
    </div>
  );
}
