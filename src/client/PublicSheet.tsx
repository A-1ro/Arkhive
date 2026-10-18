import { useState } from "react";
import {
  BookOpen,
  Fingerprint,
  Heart,
  Shield,
  UserRound,
  Zap,
} from "lucide-react";
import {
  derived,
  skillName,
  skillTotal,
  sortSkills,
  statKeys,
  statLabels,
  type Character,
} from "../shared/rules";

const noteFields = [
  ["appearance", "容姿の描写"],
  ["belief", "イデオロギー／信念"],
  ["importantPeople", "重要な人々"],
  ["meaningfulPlaces", "意味のある場所"],
  ["treasuredPossessions", "秘蔵の品"],
  ["traits", "特徴"],
  ["equipment", "装備と所持品"],
  ["notes", "セッションメモ"],
] as const;

export function PublicSheet({
  c,
  portraitUrl,
  canEdit,
}: {
  c: Character;
  portraitUrl: string | null;
  canEdit: boolean;
}) {
  const [allocatedOnly, setAllocatedOnly] = useState(false);
  const d = derived(c);
  const skills = sortSkills(c.skills).filter(
    (s) => !allocatedOnly || s.occupation + s.interest + s.growth > 0,
  );
  const vitals = [
    { label: "HP", value: c.currentHP ?? d.hp, max: d.hp, icon: Heart },
    { label: "MP", value: c.currentMP ?? d.mp, max: d.mp, icon: Zap },
    { label: "SAN", value: c.currentSAN ?? d.san, max: d.maxSAN, icon: Shield },
    { label: "幸運", value: d.luck, max: null, icon: Fingerprint },
  ];
  return (
    <article className="public-sheet-content">
      <section
        className="public-card public-profile glass"
        aria-labelledby="public-character-name"
      >
        <div className="public-profile-heading">
          <span className="edition-badge">第{c.edition}版</span>
          <span className="public-caption">クトゥルフ神話TRPG</span>
          {canEdit && (
            <a className="button button-white" href={`/?character=${c.id}`}>
              管理者として編集
            </a>
          )}
        </div>
        <div className="public-profile-body">
          <div
            className={`public-portrait ${portraitUrl ? "" : "public-portrait-empty"}`}
          >
            {portraitUrl ? (
              <img src={portraitUrl} alt={`${c.name || "探索者"}の画像`} />
            ) : (
              <UserRound size={48} strokeWidth={1} aria-hidden="true" />
            )}
          </div>
          <div className="public-profile-details">
            <p className="public-eyebrow">INVESTIGATOR</p>
            <h1 id="public-character-name">{c.name || "名前のない探索者"}</h1>
            <p className="public-occupation">{c.occupation || "職業未設定"}</p>
            <dl className="public-profile-facts">
              {[
                ["プレイヤー", c.player || "未設定"],
                ["年齢", `${c.age}歳`],
                ["性別", c.gender || "—"],
                ["出身", c.birthplace || "—"],
                ["住所", c.residence || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section
        className="public-card glass"
        aria-labelledby="public-stats-title"
      >
        <div className="public-section-heading">
          <h2 id="public-stats-title">
            <Fingerprint size={18} />
            能力値とステータス
          </h2>
          <span className="public-caption">
            {c.edition === "7"
              ? "数値 / ハード / イクストリーム"
              : "探索者の基本能力"}
          </span>
        </div>
        <dl className="public-stats-grid">
          {statKeys.map((key) => (
            <div key={key}>
              <dt>
                {key}
                <span>{statLabels[key]}</span>
              </dt>
              <dd>
                <strong>{c.stats[key]}</strong>
                {c.edition === "7" && (
                  <small>
                    {Math.floor(c.stats[key] / 2)} /{" "}
                    {Math.floor(c.stats[key] / 5)}
                  </small>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="public-vitals-grid">
          {vitals.map(({ label, value, max, icon: Icon }) => (
            <div key={label}>
              <dt>
                <Icon size={16} />
                {label}
              </dt>
              <dd>
                {value}
                {max !== null && <small> / {max}</small>}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="public-secondary-stats">
          <div>
            <dt>ダメージボーナス</dt>
            <dd>{d.db}</dd>
          </div>
          {c.edition === "7" && (
            <>
              <div>
                <dt>ビルド</dt>
                <dd>{d.build}</dd>
              </div>
              <div>
                <dt>移動率</dt>
                <dd>{d.mov}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section
        className="public-card glass"
        aria-labelledby="public-skills-title"
      >
        <div className="public-section-heading">
          <h2 id="public-skills-title">
            <BookOpen size={18} />
            技能
          </h2>
          <div
            className="public-skill-filter"
            role="group"
            aria-label="技能の表示モード"
          >
            <button
              type="button"
              aria-pressed={!allocatedOnly}
              onClick={() => setAllocatedOnly(false)}
            >
              すべて
            </button>
            <button
              type="button"
              aria-pressed={allocatedOnly}
              onClick={() => setAllocatedOnly(true)}
            >
              ポイント割り振り済み
            </button>
          </div>
        </div>
        <div className="public-skills-caption">
          <p>職業・興味・成長ポイントを含む技能値</p>
          <span role="status">
            {skills.length} / {c.skills.length} 技能
          </span>
        </div>
        {skills.length ? (
          <div className="public-skills-table-wrap">
            <table className="public-skills-table">
              <caption className="sr-only">
                探索者の技能値
                {allocatedOnly ? "（ポイント割り振り済みのみ）" : "（すべて）"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">技能名</th>
                  <th scope="col">技能値</th>
                  {c.edition === "7" && (
                    <>
                      <th scope="col">
                        ハード<span>½</span>
                      </th>
                      <th scope="col">
                        イクストリーム<span>⅕</span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => {
                  const total = skillTotal(s, c);
                  return (
                    <tr key={s.id}>
                      <th scope="row">
                        {skillName(s)}
                        {s.occupation + s.interest + s.growth > 0 && (
                          <span
                            className="public-trained-mark"
                            aria-label="ポイント割り振り済み"
                          />
                        )}
                      </th>
                      <td>
                        <strong>
                          {total}
                          <small>%</small>
                        </strong>
                      </td>
                      {c.edition === "7" && (
                        <>
                          <td>{Math.floor(total / 2)}</td>
                          <td>{Math.floor(total / 5)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="public-skills-empty">
            ポイントを割り振った技能はまだありません。
          </p>
        )}
      </section>

      <div className="public-notes-grid">
        {noteFields
          .filter(([key]) => c[key])
          .map(([key, label]) => (
            <section
              className={`public-card glass ${key === "equipment" || key === "notes" ? "public-note-wide" : ""}`}
              key={key}
              aria-labelledby={`public-${key}-title`}
            >
              <div className="public-section-heading">
                <h2 id={`public-${key}-title`}>{label}</h2>
              </div>
              <p className="public-note-text">{c[key]}</p>
            </section>
          ))}
      </div>
    </article>
  );
}
