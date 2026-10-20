import { type Character, weaponFields, weaponSchema } from "../shared/rules";
import { OptionalNumberInput } from "./OptionalNumberInput";

export function LostBadge({ lost }: { lost: boolean }) {
  return lost ? <span className="lost-badge">ロスト</span> : null;
}

export function EquipmentEditor({
  c,
  onChange,
}: {
  c: Character;
  onChange: (patch: Partial<Character>) => void;
}) {
  return (
    <div className="equipment-sections">
      <section aria-label="装備と所持品">
        <h3>装備と所持品</h3>
        {c.inventory.map((item, index) => (
          <fieldset className="inventory-row" key={index}>
            <legend>所持品 {index + 1}</legend>
            <label>
              名前
              <input
                aria-label={`所持品${index + 1}の名前`}
                value={item.name}
                maxLength={100}
                onChange={(e) =>
                  onChange({
                    inventory: c.inventory.map((x, i) =>
                      i === index ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              数量
              <OptionalNumberInput
                aria-label={`所持品${index + 1}の数量`}
                value={item.quantity}
                min={0}
                max={999}
                placeholder="未指定"
                onValueChange={(quantity) =>
                  onChange({
                    inventory: c.inventory.map((x, i) =>
                      i === index ? { ...x, quantity } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              備考
              <textarea
                aria-label={`所持品${index + 1}の備考`}
                value={item.notes}
                maxLength={1000}
                rows={2}
                onChange={(e) =>
                  onChange({
                    inventory: c.inventory.map((x, i) =>
                      i === index ? { ...x, notes: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              className="button button-white"
              onClick={() =>
                onChange({
                  inventory: c.inventory.filter((_, i) => i !== index),
                })
              }
              aria-label={`所持品${index + 1}を削除`}
            >
              削除
            </button>
          </fieldset>
        ))}
        <button
          className="button button-white"
          disabled={c.inventory.length >= 180}
          onClick={() =>
            onChange({
              inventory: [
                ...c.inventory,
                { name: "", quantity: null, notes: "" },
              ],
            })
          }
        >
          所持品を追加
        </button>
      </section>
      <section aria-label="武器">
        <h3>武器</h3>
        <p className="info-note">
          装弾数・攻撃回数などは「6+1」「1(3)」「連射」などの表記をそのまま入力できます。
        </p>
        {c.weapons.map((weapon, index) => (
          <fieldset className="weapon-row" key={index}>
            <legend>武器 {index + 1}</legend>
            {weaponFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={`武器${index + 1}の${label}`}
                  value={weapon[key]}
                  maxLength={key === "notes" ? 1000 : 100}
                  onChange={(e) =>
                    onChange({
                      weapons: c.weapons.map((x, i) =>
                        i === index ? { ...x, [key]: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <button
              className="button button-white"
              onClick={() =>
                onChange({ weapons: c.weapons.filter((_, i) => i !== index) })
              }
              aria-label={`武器${index + 1}を削除`}
            >
              削除
            </button>
          </fieldset>
        ))}
        <button
          className="button button-white"
          disabled={c.weapons.length >= 100}
          onClick={() =>
            onChange({
              weapons: [...c.weapons, weaponSchema.parse({ name: "" })],
            })
          }
        >
          武器を追加
        </button>
      </section>
    </div>
  );
}

export function EquipmentDetails({ c }: { c: Character }) {
  return (
    <>
      {c.inventory.length > 0 && (
        <section className="equipment-details">
          <h3>装備と所持品</h3>
          <div className="equipment-table-wrap">
            <table className="equipment-table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>数量</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {c.inventory.map((item, index) => (
                  <tr key={index}>
                    <th scope="row">{item.name || "—"}</th>
                    <td>{item.quantity ?? "未指定"}</td>
                    <td>{item.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {c.weapons.length > 0 && (
        <section className="equipment-details">
          <h3>武器</h3>
          <div className="equipment-table-wrap">
            <table className="equipment-table">
              <thead>
                <tr>
                  {weaponFields.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.weapons.map((weapon, index) => (
                  <tr key={index}>
                    {weaponFields.map(([key]) => (
                      <td key={key}>{weapon[key] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
