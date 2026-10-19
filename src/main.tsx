import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  Archive,
  SlidersHorizontal,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  Code2,
  Copy,
  Dices,
  Download,
  Ellipsis,
  Eye,
  FileText,
  Fingerprint,
  Heart,
  Layers3,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  characterSchema,
  derived,
  interestPoints,
  makeSkills,
  newCharacter,
  occupationPoints,
  rollAll,
  rollStat,
  skillBase,
  skillName,
  skillSpecialty,
  skillTotal,
  sortSkills,
  statKeys,
  statLabels,
  validateAllocation,
  type Character,
  type Edition,
  type Skill,
  type StatKey,
} from "./shared/rules";
import "./style.css";
import { compressImage } from "./client/compress-image";
import { NumberInput } from "./client/NumberInput";
import { PublicSheet } from "./client/PublicSheet";
import { toCcfoliaCharacter } from "./shared/ccfolia";
import { imageUrl } from "./shared/images";
import {
  legacyImportKey,
  mergeDrafts,
  readLegacyDrafts,
} from "./shared/legacy-drafts";

type User = { id: string; name: string; avatar: string | null };
type Modal =
  | "new"
  | "mcp"
  | "help"
  | "preview"
  | "sharing"
  | "delete"
  | "edition"
  | "ccfolia"
  | null;
type Toast = { text: string; kind?: "error" | "ok" };
const localKey = "mythos-notebook-v1";
function readLocal(): Character[] {
  try {
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (!Array.isArray(data)) return [];
    return data.flatMap((x) => {
      const r = characterSchema.safeParse(x);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}
const publicShareId = location.pathname.startsWith("/shared/")
  ? location.pathname.slice("/shared/".length)
  : null;
const initial = publicShareId === null ? readLocal() : [];
if (!initial.length) initial.push(newCharacter());
async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || "通信に失敗しました");
  return data;
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-mark">
        <img src="/brand/arkhive.png" alt="" width="48" height="48" />
      </span>
      {!small && (
        <span>
          Arkhive<small>探索者ノート</small>
        </span>
      )}
    </div>
  );
}
function SkillNameInput({
  skill,
  onChange,
}: {
  skill: Skill;
  onChange: (name: string) => void;
}) {
  const parts = skillSpecialty(skill.name);
  if (!parts) return <>{skillName(skill)}</>;
  return (
    <div className="specialized-skill-name">
      <span>{parts.label}（</span>
      <input
        aria-label={`${parts.label}の括弧内`}
        placeholder="自由入力"
        maxLength={100 - parts.label.length - 2}
        value={parts.specialty}
        onChange={(e) => onChange(`${parts.label}（${e.target.value}）`)}
      />
      <span>）</span>
    </div>
  );
}

function CharacterSheet({
  c,
  portraitUrl,
}: {
  c: Character;
  portraitUrl: string | null;
}) {
  const d = derived(c);
  return (
    <div className="print-sheet">
      <div className="print-title">
        <Logo />
        <span>クトゥルフ神話TRPG 第{c.edition}版</span>
      </div>
      {portraitUrl && (
        <img
          className="print-portrait"
          src={portraitUrl}
          alt={`${c.name || "探索者"}の画像`}
        />
      )}
      <h2>{c.name || "名前のない探索者"}</h2>
      <p>
        {c.occupation || "職業未設定"} · {c.age}歳 · {c.gender} · プレイヤー：
        {c.player || "未設定"}
      </p>
      <p>
        出身：{c.birthplace || "—"} ／ 住所：{c.residence || "—"}
      </p>
      <div className="print-stats">
        {statKeys.map((k) => (
          <div key={k}>
            <span>{k}</span>
            <b>{c.stats[k]}</b>
            {c.edition === "7" && (
              <small>
                {Math.floor(c.stats[k] / 2)} / {Math.floor(c.stats[k] / 5)}
              </small>
            )}
          </div>
        ))}
      </div>
      <div className="print-vitals">
        HP {c.currentHP ?? d.hp}/{d.hp}　MP {c.currentMP ?? d.mp}/{d.mp}　SAN{" "}
        {c.currentSAN ?? d.san}/{d.maxSAN}　幸運 {d.luck}
        　DB {d.db}
        {c.edition === "7" && `　ビルド ${d.build}　MOV ${d.mov}`}
      </div>
      <h3>技能</h3>
      <div className="print-skills">
        {sortSkills(c.skills).map((s) => (
          <div key={s.id}>
            <span>{skillName(s)}</span>
            <b>{skillTotal(s, c)}%</b>
            {c.edition === "7" && (
              <small>
                {Math.floor(skillTotal(s, c) / 2)} /{" "}
                {Math.floor(skillTotal(s, c) / 5)}
              </small>
            )}
          </div>
        ))}
      </div>
      {(
        [
          ["appearance", "容姿の描写"],
          ["belief", "イデオロギー／信念"],
          ["importantPeople", "重要な人々"],
          ["meaningfulPlaces", "意味のある場所"],
          ["treasuredPossessions", "秘蔵の品"],
          ["traits", "特徴"],
          ["equipment", "装備と所持品"],
          ["notes", "セッションメモ"],
        ] as const
      )
        .filter(([key]) => c[key])
        .map(([key, label]) => (
          <div className="print-note" key={key}>
            <h3>{label}</h3>
            <p>{c[key]}</p>
          </div>
        ))}
    </div>
  );
}

function PublicCharacter({ shareId }: { shareId: string }) {
  const [data, setData] = useState<{
    character: Character;
    canEdit: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    void api<{ character: Character; canEdit: boolean }>(
      `/api/public/characters/${encodeURIComponent(shareId)}`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [shareId, attempt]);
  return (
    <main className="public-sheet-page">
      <header className="public-sheet-header">
        <a href="/" aria-label="Arkhive トップへ">
          <Logo />
        </a>
        <span>
          <Eye size={16} /> 公開キャラクターシート · 閲覧専用
        </span>
      </header>
      {error ? (
        <div className="public-sheet-message" role="alert">
          <h1>シートを表示できません</h1>
          <p>{error}</p>
          <button
            className="button button-white"
            onClick={() => setAttempt((n) => n + 1)}
          >
            再読み込み
          </button>
          <a className="button button-white" href="/">
            トップへ
          </a>
        </div>
      ) : !data ? (
        <p role="status">シートを読み込んでいます…</p>
      ) : (
        <>
          <PublicSheet
            c={data.character}
            canEdit={data.canEdit}
            portraitUrl={
              data.character.image
                ? `/api/public/characters/${encodeURIComponent(shareId)}/image?v=${data.character.image.version}`
                : null
            }
          />
        </>
      )}
    </main>
  );
}

function App() {
  const [sheets, setSheets] = useState<Character[]>(initial);
  const [activeId, setActiveId] = useState(initial[0].id);
  const [tab, setTab] = useState("profile");
  const [view, setView] = useState<"archive" | "editor">(
    new URLSearchParams(location.search).has("character")
      ? "editor"
      : "archive",
  );
  const [archiveSearch, setArchiveSearch] = useState("");
  const [editionFilter, setEditionFilter] = useState("all");
  const [archiveSort, setArchiveSort] = useState("updated");
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [configured, setConfigured] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingCcfolia, setCopyingCcfolia] = useState(false);
  const [ccfoliaJSON, setCcfoliaJSON] = useState("");
  const ccfoliaCopy = useRef<symbol | null>(null);
  const [sharing, setSharing] = useState<{
    id: string;
    shareId: string | null;
  } | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState("");
  const [imageBusy, setImageBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState(false);
  const [legacyImported, setLegacyImported] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("すべて");
  const [allocatedOnly, setAllocatedOnly] = useState(false);
  const [rolling, setRolling] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState("");
  const [newEdition, setNewEdition] = useState<Edition>("7");
  const [connections, setConnections] = useState<
    { id: string; name: string; created_at: number; expires_at: number }[]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const modalTrigger = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const c = sheets.find((x) => x.id === activeId) || sheets[0];
  const portraitUrl = user && c.image ? imageUrl(c.id, c.image.version) : null;
  const d = derived(c);
  const op = occupationPoints(c),
    ip = interestPoints(c);
  const usedOp = c.skills.reduce((n, s) => n + s.occupation, 0),
    usedIp = c.skills.reduce((n, s) => n + s.interest, 0);
  const errors = validateAllocation(c);
  function openModal(next: Exclude<Modal, null>) {
    modalTrigger.current = document.activeElement as HTMLElement | null;
    setModal(next);
  }
  function notify(text: string, kind: Toast["kind"] = "ok") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const me = await api<{ user: User | null; discordConfigured: boolean }>(
          "/api/me",
        );
        if (!live) return;
        setUser(me.user);
        setConfigured(me.discordConfigured);
        if (me.user) {
          const remote = await api<Character[]>("/api/characters");
          if (!live) return;
          setSheets((local) => {
            const merged = new Map(local.map((x) => [x.id, x]));
            for (const r of remote) {
              const parsed = characterSchema.safeParse(r);
              if (
                parsed.success &&
                (!merged.has(r.id) || r.updatedAt > merged.get(r.id)!.updatedAt)
              )
                merged.set(r.id, parsed.data);
            }
            return Array.from(merged.values());
          });
          const requested = new URLSearchParams(location.search).get(
            "character",
          );
          if (requested && remote.some((x) => x.id === requested))
            setActiveId(requested);
        }
      } catch {
        if (live)
          notify(
            "クラウドに接続できません。端末に保存した探索者は編集できます。",
            "error",
          );
      } finally {
        if (live) setLoading(false);
      }
    })();
    const auth = new URLSearchParams(location.search).get("auth");
    if (auth === "setup") {
      openModal("help");
    }
    if (auth === "failed")
      notify("Discord認証に失敗しました。もう一度お試しください。", "error");
    if (auth === "success") notify("Discordにログインしました");
    if (auth) history.replaceState({}, "", location.pathname);
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    void readLegacyDrafts().then((legacy) => {
      if (!live || legacy === null) return;
      setSheets((current) => mergeDrafts(current, legacy.drafts));
      setLegacyImported(legacy.complete);
      if (legacy.drafts.length) notify("旧URLの端末保存データを引き継ぎました");
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(localKey, JSON.stringify(sheets));
      if (legacyImported) localStorage.setItem(legacyImportKey, "done");
      setLocalError(false);
    } catch {
      setLocalError(true);
    }
  }, [sheets, legacyImported]);
  useEffect(() => {
    if (modal !== "mcp" || !user) return;
    void api<typeof connections>("/api/connections")
      .then(setConnections)
      .catch((e) => notify(e.message, "error"));
  }, [modal, user]);
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
    };
  }, [modal]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById("workspace-navigation");
    sidebar?.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
      if (e.key !== "Tab" || !sidebar) return;
      const items = Array.from(
        sidebar.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"),
      ).filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
      if (window.matchMedia("(max-width: 760px)").matches)
        document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
      else previous?.focus();
    };
  }, [menu]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenu(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (modal !== "sharing" || !user) return;
    let live = true;
    setSharing(null);
    setSharingError("");
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${c.id}/sharing`, {
          signal: AbortSignal.timeout(15000),
        });
        const result = (await response.json()) as {
          shareId: string | null;
          error?: string;
        };
        if (!response.ok && response.status !== 404)
          throw new Error(result.error || "公開設定を取得できません");
        if (live)
          setSharing({
            id: c.id,
            shareId: response.status === 404 ? null : result.shareId,
          });
      } catch (e) {
        if (live) setSharingError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [modal, user, c.id]);
  async function changeSharing(enabled: boolean) {
    if (!user || sharingBusy || saving || imageBusy) return;
    if (enabled && errors.length) {
      setSharingError(errors.join("・"));
      return;
    }
    setSharingBusy(true);
    setSharingError("");
    try {
      if (enabled) {
        const saved = await api<Character>(`/api/characters/${c.id}`, {
          method: "PUT",
          body: JSON.stringify(c),
        });
        setSheets((xs) =>
          xs.map((x) =>
            x.id === saved.id && x.updatedAt === c.updatedAt ? saved : x,
          ),
        );
      }
      const result = await api<{ shareId: string | null }>(
        `/api/characters/${c.id}/sharing`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        },
      );
      setSharing({ id: c.id, shareId: result.shareId });
      notify(enabled ? "シートを公開しました" : "公開を停止しました");
    } catch (e) {
      setSharingError((e as Error).message);
    } finally {
      setSharingBusy(false);
    }
  }
  function update(patch: Partial<Character>) {
    setSheets((items) =>
      items.map((x) =>
        x.id === c.id
          ? { ...x, ...patch, updatedAt: new Date().toISOString() }
          : x,
      ),
    );
  }
  function updateSkill(id: string, patch: Partial<Skill>) {
    update({
      skills: c.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function roll(key?: StatKey | "LUCK") {
    if (rolling) return;
    setRolling(key || "all");
    if (!key) {
      const r = rollAll(c);
      update(r);
      setLastRoll("すべての能力値をロールしました");
    } else {
      const r = rollStat(key, c.edition);
      if (key === "LUCK") update({ luck: r.value });
      else update({ stats: { ...c.stats, [key]: r.value } });
      setLastRoll(
        `${key} : [ ${r.dice.join(" + ")} ]${r.bonus ? " + " + r.bonus : ""}${c.edition === "7" ? " × 5" : ""} = ${r.value}`,
      );
    }
    setTimeout(() => setRolling(null), 650);
  }
  function create(edition: Edition) {
    const character = newCharacter(edition);
    setSheets((xs) => [character, ...xs]);
    setActiveId(character.id);
    setView("editor");
    setTab("profile");
    setModal(null);
    setMenu(false);
    notify("新しい探索者ノートを作成しました");
  }
  async function save() {
    if (!user) {
      openModal("help");
      return;
    }
    if (errors.length) {
      notify(errors.join("・"), "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await api<Character>(`/api/characters/${c.id}`, {
        method: "PUT",
        body: JSON.stringify(c),
      });
      setSheets((xs) =>
        xs.map((x) =>
          x.id === saved.id && x.updatedAt === c.updatedAt ? saved : x,
        ),
      );
      notify("クラウドに保存しました");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function uploadImage(file?: File) {
    if (!file || !user || imageBusy || saving) return;
    if (errors.length) {
      notify(errors.join("・"), "error");
      return;
    }
    setImageBusy(c.id);
    try {
      const blob = await compressImage(file);
      // A locally created character must exist in D1 before its image is attached.
      const saved = await api<Character>(`/api/characters/${c.id}`, {
        method: "PUT",
        body: JSON.stringify(c),
      });
      setSheets((xs) =>
        xs.map((x) =>
          x.id === c.id && x.updatedAt === c.updatedAt ? saved : x,
        ),
      );
      const result = await api<Pick<Character, "image" | "updatedAt">>(
        `/api/characters/${c.id}/image`,
        {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: blob,
        },
      );
      setSheets((xs) =>
        xs.map((x) =>
          x.id === c.id
            ? {
                ...x,
                image: result.image,
                updatedAt:
                  x.updatedAt > result.updatedAt
                    ? x.updatedAt
                    : result.updatedAt,
              }
            : x,
        ),
      );
      notify(
        `画像を圧縮して登録しました（${Math.ceil(blob.size / 1024)}KB）。探索者もクラウドへ保存しました`,
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setImageBusy(null);
    }
  }
  async function removeImage() {
    if (!user || imageBusy || saving) return;
    setImageBusy(c.id);
    try {
      const result = await api<Pick<Character, "image" | "updatedAt">>(
        `/api/characters/${c.id}/image`,
        { method: "DELETE" },
      );
      setSheets((xs) =>
        xs.map((x) =>
          x.id === c.id
            ? {
                ...x,
                image: null,
                updatedAt:
                  x.updatedAt > result.updatedAt
                    ? x.updatedAt
                    : result.updatedAt,
              }
            : x,
        ),
      );
      notify("画像を削除しました");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setImageBusy(null);
    }
  }
  // Ignore late clipboard results after navigating to another sheet or dialog.
  useEffect(() => {
    ccfoliaCopy.current = null;
    setCopyingCcfolia(false);
  }, [activeId, view, modal]);
  async function exportCcfolia() {
    if (ccfoliaCopy.current) return;
    const request = Symbol();
    ccfoliaCopy.current = request;
    const json = JSON.stringify(toCcfoliaCharacter(c));
    const trigger = document.activeElement as HTMLElement | null;
    setCopyingCcfolia(true);
    try {
      // Invoke while the click still has browser user activation. No save or fetch.
      await navigator.clipboard.writeText(json);
      if (ccfoliaCopy.current === request)
        notify(
          "CCFOLIA用のコマをコピーしました。ルームの盤面に貼り付けてください",
        );
    } catch {
      if (ccfoliaCopy.current === request) {
        setCcfoliaJSON(json);
        if (modal === null) modalTrigger.current = trigger;
        setModal("ccfolia");
      }
    } finally {
      if (ccfoliaCopy.current === request) {
        ccfoliaCopy.current = null;
        setCopyingCcfolia(false);
      }
    }
  }
  function exportJSON() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }),
    );
    a.href = url;
    a.download = `${c.name || "探索者"}_${c.edition}版.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("JSONを書き出しました");
  }
  async function importJSON(file?: File) {
    if (!file) return;
    if (file.size > 256 * 1024) {
      notify("256KB以下のJSONを選択してください", "error");
      return;
    }
    try {
      const parsed = characterSchema.parse(JSON.parse(await file.text()));
      parsed.id = crypto.randomUUID();
      parsed.image = null;
      parsed.updatedAt = new Date().toISOString();
      setSheets((xs) => [parsed, ...xs]);
      setActiveId(parsed.id);
      setView("editor");
      setTab("profile");
      notify("探索者を読み込みました");
    } catch {
      notify("Arkhiveの探索者JSON形式を確認してください", "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function remove() {
    try {
      if (user) await api(`/api/characters/${c.id}`, { method: "DELETE" });
      const rest = sheets.filter((x) => x.id !== c.id);
      if (!rest.length) rest.push(newCharacter(c.edition));
      setSheets(rest);
      setActiveId(rest[0].id);
      setModal(null);
      notify("探索者を削除しました");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  function switchEdition() {
    const edition = c.edition === "7" ? "6" : "7";
    const factor = edition === "7" ? 5 : 0.2;
    const stats = { ...c.stats };
    statKeys.forEach((k) => (stats[k] = Math.round(stats[k] * factor)));
    update({
      edition,
      stats,
      skills: makeSkills(edition),
      pointMode: "edu",
      currentHP: null,
      currentMP: null,
      currentSAN: null,
    });
    setModal(null);
    notify(
      `第${edition}版に切り替えました。技能ポイントを再設定してください。`,
    );
  }
  function addSkill() {
    const s: Skill = {
      id: crypto.randomUUID(),
      name: "新しい技能",
      base: 0,
      occupation: 0,
      interest: 0,
      growth: 0,
      custom: true,
      category: "自由技能",
    };
    update({ skills: [...c.skills, s] });
    setSearch("");
    setCategory("自由技能");
    setAllocatedOnly(false);
    notify("自由技能を追加しました。名前と初期値を編集できます。");
  }
  const tabs = [
    { id: "profile", name: "基本情報", icon: UserRound },
    { id: "stats", name: "能力値", icon: Dices },
    { id: "skills", name: "技能", icon: WandSparkles },
    { id: "story", name: "背景", icon: BookOpen },
    { id: "equipment", name: "装備・メモ", icon: FileText },
  ];
  const progress = [
    !!c.name,
    statKeys.every((k) => c.stats[k] > 0),
    usedOp > 0 || usedIp > 0,
    !!(c.appearance || c.belief || c.notes),
    !!c.equipment,
  ].filter(Boolean).length;
  const archiveSheets = sheets
    .filter(
      (sheet) =>
        (editionFilter === "all" || sheet.edition === editionFilter) &&
        `${sheet.name} ${sheet.occupation} ${sheet.player}`
          .toLocaleLowerCase()
          .includes(archiveSearch.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      archiveSort === "name"
        ? a.name.localeCompare(b.name, "ja")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <>
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <aside
        id="workspace-navigation"
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
        aria-label="ワークスペース"
        inert={!!modal}
      >
        <button
          className="logo-link"
          aria-label="Arkhive 探索者一覧"
          onClick={() => {
            setView("archive");
            setMenu(false);
          }}
        >
          <Logo />
        </button>
        <button
          className="icon-button sidebar-close"
          aria-label="メニューを閉じる"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">ワークスペース</div>
        <button
          className={`nav-item ${view === "archive" ? "nav-active" : ""}`}
          aria-current={view === "archive" ? "page" : undefined}
          onClick={() => {
            setMenu(false);
            setView("archive");
          }}
        >
          <Layers3 size={18} />
          探索者一覧<span className="nav-count">{sheets.length}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            openModal("mcp");
            setMenu(false);
          }}
        >
          <Code2 size={18} />
          MCP連携
          <ArrowRight className="nav-trailing" size={14} />
        </button>
        <div className="sidebar-section">
          <span>マイ探索者</span>
          <button
            className="icon-button"
            aria-label="探索者を追加"
            onClick={() => {
              setMenu(false);
              openModal("new");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="sheet-list">
          {sheets.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setView("editor");
                setTab("profile");
                setMenu(false);
              }}
              aria-current={
                view === "editor" && s.id === c.id ? "page" : undefined
              }
              className={`sheet-item ${view === "editor" && s.id === c.id ? "sheet-selected" : ""}`}
            >
              <span className="sheet-avatar">
                <UserRound size={16} />
              </span>
              <span>
                {s.name || "名前のない探索者"}
                <small>
                  第{s.edition}版 · {s.occupation || "職業未設定"}
                </small>
              </span>
              {view === "editor" && s.id === c.id && (
                <span className="selected-dot" />
              )}
            </button>
          ))}
        </div>
        <button
          className="add-note"
          onClick={() => {
            setMenu(false);
            openModal("new");
          }}
        >
          <Plus size={16} />
          新しい探索者を作成
        </button>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              setMenu(false);
              openModal("help");
            }}
          >
            <CircleHelp size={17} />
            使い方・このサイトについて
          </button>
          <div className="sidebar-foot">
            <span
              className={`status-dot ${localError ? "status-error" : ""}`}
            />{" "}
            {localError ? "端末保存の空き容量を確認" : "端末に自動保存"}
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-shade"
          aria-label="メニューを閉じる"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="app-shell" inert={menu || !!modal}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="メニューを開く"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="mobile-brand">
              <Logo small />
            </span>
            <Archive size={16} className="breadcrumb-icon" />
            <button
              className="breadcrumb-home"
              onClick={() => setView("archive")}
            >
              記録庫
            </button>
            <ChevronRight size={13} />
            <strong>
              {view === "archive" ? "探索者一覧" : c.name || "新しい探索者"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="save-status" role="status">
              <span
                className={`status-dot ${localError ? "status-error" : ""}`}
              />
              {localError ? "端末保存に失敗" : "端末に自動保存"}
            </span>
            {user ? (
              <button
                className="user-button"
                onClick={async () => {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setConnections([]);
                  notify("ログアウトしました");
                }}
                title="ログアウト"
              >
                <UserRound size={16} />
                <span>{user.name}</span>
                <LogOut size={14} />
              </button>
            ) : (
              <a className="discord-login" href="/auth/discord">
                <DiscordIcon />
                Discordでログイン
                <ArrowRight size={14} />
              </a>
            )}
          </div>
        </header>
        <main id="main-content" className={`workspace-${view}`} tabIndex={-1}>
          {view === "archive" ? (
            <>
              <div className="page-heading archive-heading">
                <div>
                  <h1>探索者一覧</h1>
                </div>
                <button
                  className="button button-primary"
                  onClick={() => openModal("new")}
                >
                  <Plus size={18} />
                  新しい探索者
                </button>
              </div>
              <div className="archive-overview">
                <div>
                  <span className="overview-icon">
                    <Layers3 size={21} />
                  </span>
                  <div>
                    <span>すべての探索者</span>
                    <strong>
                      {sheets.length.toString().padStart(2, "0")}
                      <small>件</small>
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="overview-icon">
                    <BookOpen size={21} />
                  </span>
                  <div>
                    <span>新クトゥルフ神話TRPG</span>
                    <strong>
                      {sheets
                        .filter((s) => s.edition === "7")
                        .length.toString()
                        .padStart(2, "0")}
                      <small>第7版</small>
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="overview-icon">
                    <Archive size={21} />
                  </span>
                  <div>
                    <span>クトゥルフ神話TRPG</span>
                    <strong>
                      {sheets
                        .filter((s) => s.edition === "6")
                        .length.toString()
                        .padStart(2, "0")}
                      <small>第6版</small>
                    </strong>
                  </div>
                </div>
              </div>
              <section
                className="archive-section"
                aria-labelledby="archive-title"
              >
                <div className="archive-section-heading">
                  <div>
                    <h2 id="archive-title">マイ探索者</h2>
                    <span className="count-badge">{sheets.length}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={15} />
                    JSONを読み込む
                  </button>
                </div>
                <div className="archive-toolbar">
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      aria-label="探索者を検索"
                      placeholder="探索者名・職業・プレイヤーで検索"
                      value={archiveSearch}
                      onChange={(e) => setArchiveSearch(e.target.value)}
                    />
                    {archiveSearch && (
                      <button
                        className="icon-button"
                        aria-label="探索者の検索をクリア"
                        onClick={() => setArchiveSearch("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className="archive-filters">
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    <select
                      aria-label="探索者の版で絞り込み"
                      value={editionFilter}
                      onChange={(e) => setEditionFilter(e.target.value)}
                    >
                      <option value="all">すべての版</option>
                      <option value="7">第7版</option>
                      <option value="6">第6版</option>
                    </select>
                    <select
                      aria-label="探索者の並び順"
                      value={archiveSort}
                      onChange={(e) => setArchiveSort(e.target.value)}
                    >
                      <option value="updated">更新が新しい順</option>
                      <option value="name">名前順</option>
                    </select>
                  </div>
                </div>
                <div className="investigator-grid">
                  {archiveSheets.map((s) => (
                    <button
                      className="investigator-card"
                      key={s.id}
                      onClick={() => {
                        setActiveId(s.id);
                        setView("editor");
                        setTab("profile");
                      }}
                    >
                      <div className="investigator-card-top">
                        <span className="archive-avatar">
                          {user && s.image ? (
                            <img src={imageUrl(s.id, s.image.version)} alt="" />
                          ) : (
                            <UserRound size={30} strokeWidth={1.2} />
                          )}
                        </span>
                        <span className="edition-badge">第{s.edition}版</span>
                      </div>
                      <h3>{s.name || "名前のない探索者"}</h3>
                      <p>
                        {s.occupation || "職業未設定"}
                        {s.player && <span> · {s.player}</span>}
                      </p>
                      <div className="card-stat-row">
                        {["STR", "DEX", "INT", "EDU"].map((key) => (
                          <span key={key}>
                            {key}
                            <b>{s.stats[key as StatKey] || "—"}</b>
                          </span>
                        ))}
                      </div>
                      <div className="investigator-card-foot">
                        <span>
                          <span className="status-dot" />
                          {new Date(s.updatedAt).toLocaleDateString(
                            "ja-JP",
                          )}{" "}
                          更新
                        </span>
                        <span className="card-open">
                          シートを開く
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </button>
                  ))}
                  {!archiveSheets.length && (
                    <div className="archive-empty">
                      <Search size={30} strokeWidth={1.3} />
                      <h3>探索者が見つかりません</h3>
                      <p>検索条件を変えて、もう一度お試しください。</p>
                      <button
                        className="button button-white"
                        onClick={() => {
                          setArchiveSearch("");
                          setEditionFilter("all");
                        }}
                      >
                        絞り込みをリセット
                      </button>
                    </div>
                  )}
                  <button
                    className="create-card"
                    onClick={() => openModal("new")}
                  >
                    <span>
                      <Plus size={24} />
                    </span>
                    <strong>新しい探索者を作成</strong>
                  </button>
                </div>
                <div className="archive-storage-note">
                  <Shield size={15} />
                  <span>
                    公開範囲は探索者ごとに設定できます。編集内容は端末に自動保存されます。
                  </span>
                  {!user && (
                    <a href="/auth/discord">
                      クラウド保存を利用する
                      <ArrowRight size={14} />
                    </a>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <button
                    className="back-link"
                    onClick={() => setView("archive")}
                  >
                    <ArrowLeft size={14} />
                    探索者一覧に戻る
                  </button>
                  <h1>探索者シート</h1>
                </div>
                <button
                  className="button button-white new-button"
                  onClick={() => openModal("new")}
                >
                  <Plus size={17} />
                  新規作成
                </button>
              </div>
              <div className="editor-top">
                <div className="editor-title">
                  <span className="editor-icon">
                    <FileText size={20} />
                  </span>
                  <div>
                    <h2>{c.name || "新しい探索者"}</h2>
                    <span>{c.name ? "編集中" : "下書き"}</span>
                  </div>
                  <button
                    className="edition-switch"
                    onClick={() => openModal("edition")}
                  >
                    第{c.edition}版 <ChevronDown size={13} />
                  </button>
                </div>
                <div className="editor-actions">
                  <div
                    className="editor-action-group editor-primary-actions"
                    role="group"
                    aria-label="保存とプレビュー"
                  >
                    <button
                      className="button button-white preview-btn"
                      onClick={() => openModal("preview")}
                    >
                      <Eye size={16} />
                      <span>プレビュー</span>
                    </button>
                    <button
                      className="button button-primary"
                      onClick={() => void save()}
                      disabled={saving || !!imageBusy}
                    >
                      {saving ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Cloud size={16} />
                      )}
                      <span>{saving ? "保存中" : "クラウドに保存"}</span>
                    </button>
                  </div>
                  <div
                    className="editor-action-group editor-secondary-actions"
                    role="group"
                    aria-label="出力と公開"
                  >
                    <button
                      className="button button-white"
                      onClick={() => void exportCcfolia()}
                      disabled={copyingCcfolia}
                      aria-busy={copyingCcfolia}
                      title="現在の入力内容をコピーします。画像・メモ・プロフィールは含みません"
                    >
                      <Copy size={16} />
                      <span>CCFOLIAコマ出力</span>
                    </button>
                    <button
                      className="button button-white"
                      onClick={() => openModal("sharing")}
                      disabled={saving || !!imageBusy}
                    >
                      <Link2 size={16} />
                      <span>公開設定</span>
                    </button>
                  </div>
                </div>
              </div>
              <nav className="tabs" role="tablist" aria-label="編集する項目">
                {tabs.map((t, i) => (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls="editor-panel"
                    tabIndex={tab === t.id ? 0 : -1}
                    onKeyDown={(e) => {
                      const next =
                        e.key === "ArrowRight"
                          ? (i + 1) % tabs.length
                          : e.key === "ArrowLeft"
                            ? (i + tabs.length - 1) % tabs.length
                            : e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? tabs.length - 1
                                : -1;
                      if (next < 0) return;
                      e.preventDefault();
                      setTab(tabs[next].id);
                      document.getElementById(`tab-${tabs[next].id}`)?.focus();
                    }}
                    onClick={() => setTab(t.id)}
                    className={tab === t.id ? "tab-active" : ""}
                  >
                    <t.icon size={16} />
                    <span>{t.name}</span>
                    <small>0{i + 1}</small>
                  </button>
                ))}
              </nav>
              <div className="editor-layout">
                <div
                  className="editor-content"
                  id="editor-panel"
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                  key={`${c.id}-${tab}`}
                >
                  {tab === "profile" && (
                    <>
                      <section className="panel glass">
                        <SectionTitle
                          number="01"
                          title="基本情報"
                          sub="探索者名や職業などを入力してください。"
                        />
                        <div className="profile-layout">
                          <div
                            className="character-image-editor"
                            aria-busy={imageBusy === c.id}
                          >
                            <div className="character-portrait">
                              {portraitUrl ? (
                                <img
                                  key={portraitUrl}
                                  src={portraitUrl}
                                  alt={`${c.name || "探索者"}の画像`}
                                />
                              ) : (
                                <UserRound
                                  size={48}
                                  strokeWidth={1}
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <div className="character-image-controls">
                              <span className="character-image-label">
                                探索者の画像
                              </span>
                              {user ? (
                                <>
                                  <button
                                    className="button button-white"
                                    onClick={() => imageRef.current?.click()}
                                    disabled={!!imageBusy || saving}
                                  >
                                    {imageBusy === c.id ? (
                                      <LoaderCircle
                                        size={15}
                                        className="spin"
                                      />
                                    ) : (
                                      <Upload size={15} />
                                    )}
                                    {imageBusy === c.id
                                      ? "処理中…"
                                      : c.image
                                        ? "画像を変更"
                                        : "画像を登録"}
                                  </button>
                                  {c.image && (
                                    <button
                                      className="text-button text-error"
                                      onClick={() => void removeImage()}
                                      disabled={!!imageBusy || saving}
                                    >
                                      <Trash2 size={14} />
                                      画像を削除
                                    </button>
                                  )}
                                  <p>
                                    JPEG・PNG・WebP / 20MBまで
                                    <br />
                                    自動圧縮して保存します。画像の登録時に探索者もクラウドへ保存します。
                                  </p>
                                  {c.image && (
                                    <small>
                                      {c.image.width} × {c.image.height}px ·{" "}
                                      {Math.ceil(c.image.size / 1024)}KB
                                    </small>
                                  )}
                                </>
                              ) : (
                                <p>
                                  <a href="/auth/discord">Discordでログイン</a>
                                  すると画像を登録できます。
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="form-grid">
                            <Field label="探索者名" hint="NAME" wide>
                              <input
                                value={c.name}
                                maxLength={100}
                                placeholder="探索者の名前"
                                onChange={(e) =>
                                  update({ name: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="職業" hint="OCCUPATION">
                              <input
                                value={c.occupation}
                                placeholder="例：私立探偵"
                                maxLength={100}
                                onChange={(e) =>
                                  update({ occupation: e.target.value })
                                }
                                list="occupations"
                              />
                              <datalist id="occupations">
                                {[
                                  "私立探偵",
                                  "医師",
                                  "大学教授",
                                  "作家",
                                  "ジャーナリスト",
                                  "警察官",
                                  "古物研究家",
                                  "ディレッタント",
                                ].map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </datalist>
                            </Field>
                            <Field label="プレイヤー名" hint="PLAYER">
                              <input
                                value={c.player}
                                placeholder="あなたの名前"
                                maxLength={100}
                                onChange={(e) =>
                                  update({ player: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="年齢" hint="AGE">
                              <div className="input-unit">
                                <NumberInput
                                  value={c.age}
                                  min={15}
                                  max={99}
                                  onValueChange={(age) => update({ age })}
                                />
                                <span>歳</span>
                              </div>
                            </Field>
                            <Field label="性別" hint="GENDER">
                              <input
                                value={c.gender}
                                maxLength={50}
                                placeholder="自由に入力"
                                onChange={(e) =>
                                  update({ gender: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="出身" hint="BIRTHPLACE">
                              <input
                                value={c.birthplace}
                                maxLength={100}
                                placeholder="例：日本・東京"
                                onChange={(e) =>
                                  update({ birthplace: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="住所" hint="RESIDENCE">
                              <input
                                value={c.residence}
                                maxLength={100}
                                placeholder="例：アーカム"
                                onChange={(e) =>
                                  update({ residence: e.target.value })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                        <div className="panel-note">
                          <Shield size={14} />
                          探索者は初期状態で非公開。ログインすると、クラウドにも保存できます。
                        </div>
                      </section>
                      {StatsPanel({ compact: true })}
                      <div className="next-row">
                        <button
                          className="text-button"
                          onClick={() => setTab("stats")}
                        >
                          能力値をくわしく設定
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                  {tab === "stats" && (
                    <>
                      {StatsPanel({})}
                      <section className="panel glass">
                        <SectionTitle
                          number="02"
                          title="派生ステータス"
                          sub="能力値から自動計算。現在値はセッションに合わせて編集できます。"
                        />
                        <div className="derived-grid">
                          {(
                            [
                              ["耐久力", "HP", "currentHP", d.hp],
                              ["マジック・ポイント", "MP", "currentMP", d.mp],
                              ["正気度", "SAN", "currentSAN", d.san],
                            ] as const
                          ).map(([label, short, key, value]) => (
                            <div className="derived-card" key={key}>
                              <span>
                                {label} <small>{short}</small>
                              </span>
                              <div>
                                <NumberInput
                                  aria-label={`${label}の現在値`}
                                  min={0}
                                  max={key === "currentSAN" ? d.maxSAN : value}
                                  value={c[key] ?? value}
                                  onValueChange={(current) =>
                                    update({ [key]: current })
                                  }
                                />
                                <span>
                                  / {key === "currentSAN" ? d.maxSAN : value}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="derived-chips">
                          <span>
                            アイデア <b>{d.idea}</b>
                          </span>
                          <span>
                            知識 <b>{d.knowledge}</b>
                          </span>
                          <span>
                            DB <b>{d.db}</b>
                          </span>
                          {c.edition === "7" && (
                            <>
                              <span>
                                ビルド <b>{d.build}</b>
                              </span>
                              <span>
                                移動率 <b>{d.mov}</b>
                              </span>
                            </>
                          )}
                        </div>
                        <div className="info-note">
                          年齢による能力値の減少・EDUの上達は自動適用されません。ルールブックに従って能力値を調整してください。移動率の年齢補正は自動計算します。
                        </div>
                      </section>
                      <button
                        className="button button-primary section-next"
                        onClick={() => setTab("skills")}
                      >
                        技能を設定する
                        <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                  {tab === "skills" && (
                    <>
                      <section className="panel glass">
                        <SectionTitle
                          number="03"
                          title="技能ポイント"
                          sub="職業ポイントの算出方法と割り振りを設定します。"
                        />
                        <div className="point-mode">
                          <button
                            aria-pressed={c.pointMode === "edu"}
                            onClick={() => update({ pointMode: "edu" })}
                            className={c.pointMode === "edu" ? "selected" : ""}
                          >
                            EDUから算出
                          </button>
                          <button
                            aria-pressed={c.pointMode === "combination"}
                            onClick={() => update({ pointMode: "combination" })}
                            className={
                              c.pointMode === "combination" ? "selected" : ""
                            }
                          >
                            能力値を組み合わせ
                          </button>
                          <button
                            aria-pressed={c.pointMode === "manual"}
                            onClick={() => update({ pointMode: "manual" })}
                            className={
                              c.pointMode === "manual" ? "selected" : ""
                            }
                          >
                            自由記述・直接入力
                          </button>
                        </div>
                        {c.pointMode === "edu" && (
                          <div className="formula">
                            <span>職業ポイント</span>
                            <b>
                              EDU <em>×</em> {c.edition === "7" ? 4 : 20}{" "}
                              <em>=</em> {op}
                            </b>
                            <small>基本の算出方法</small>
                          </div>
                        )}
                        {c.pointMode === "combination" && (
                          <div className="terms">
                            {c.terms.map((term, i) => (
                              <div className="term" key={i}>
                                <select
                                  aria-label={`算出に使う能力値${i + 1}`}
                                  value={term.stat}
                                  onChange={(e) =>
                                    update({
                                      terms: c.terms.map((t, j) =>
                                        i === j
                                          ? {
                                              ...t,
                                              stat: e.target.value as StatKey,
                                            }
                                          : t,
                                      ),
                                    })
                                  }
                                >
                                  {statKeys.map((k) => (
                                    <option key={k}>{k}</option>
                                  ))}
                                </select>
                                <span>×</span>
                                <NumberInput
                                  aria-label={`係数${i + 1}`}
                                  min={0}
                                  max={100}
                                  value={term.multiplier}
                                  decimal
                                  onValueChange={(multiplier) =>
                                    update({
                                      terms: c.terms.map((t, j) =>
                                        i === j ? { ...t, multiplier } : t,
                                      ),
                                    })
                                  }
                                />
                                <button
                                  className="icon-button"
                                  aria-label={`算出項目${i + 1}を削除`}
                                  onClick={() =>
                                    update({
                                      terms: c.terms.filter((_, j) => i !== j),
                                    })
                                  }
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                            {c.terms.length < 8 && (
                              <button
                                className="button button-white"
                                onClick={() =>
                                  update({
                                    terms: [
                                      ...c.terms,
                                      { stat: "EDU", multiplier: 2 },
                                    ],
                                  })
                                }
                              >
                                <Plus size={14} />
                                項目を追加
                              </button>
                            )}
                            <strong>= {op} pt</strong>
                          </div>
                        )}
                        {c.pointMode === "manual" && (
                          <div className="form-grid manual-points">
                            <Field label="職業ポイント（直接入力）">
                              <NumberInput
                                min={0}
                                max={999}
                                value={c.manualPoints}
                                onValueChange={(manualPoints) =>
                                  update({ manualPoints })
                                }
                              />
                            </Field>
                            <Field label="算出方法・ハウスルール（自由記述）">
                              <input
                                placeholder="例：EDU×10＋APP×10、KP指定"
                                maxLength={1000}
                                value={c.pointNote}
                                onChange={(e) =>
                                  update({ pointNote: e.target.value })
                                }
                              />
                            </Field>
                          </div>
                        )}
                        <div className="point-bars">
                          <PointBar
                            label="職業ポイント"
                            used={usedOp}
                            total={op}
                          />
                          <PointBar
                            label="興味ポイント"
                            used={usedIp}
                            total={ip}
                            green
                          />
                        </div>
                      </section>
                      <section className="panel glass skills-panel">
                        <div className="skill-header">
                          <SectionTitle
                            title="技能一覧"
                            sub="初期値 ＋ 職業 ＋ 興味 ＋ 成長 ＝ 技能値"
                          />
                          <button
                            className="button button-white"
                            onClick={addSkill}
                          >
                            <Plus size={15} />
                            自由技能
                          </button>
                        </div>
                        <div className="skill-filter">
                          <div className="search-input">
                            <Search size={16} />
                            <input
                              aria-label="技能を検索"
                              placeholder="技能を検索…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          <select
                            aria-label="技能カテゴリ"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            {[
                              "すべて",
                              "探索",
                              "戦闘",
                              "行動",
                              "交渉",
                              "知識",
                              "技術",
                              "自由技能",
                            ].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={allocatedOnly}
                              onChange={(e) =>
                                setAllocatedOnly(e.target.checked)
                              }
                            />
                            割り振り済み
                          </label>
                        </div>
                        <div className="skill-scroll-hint">
                          <ArrowRight size={14} />
                          技能表は横にスクロールできます
                        </div>
                        <div
                          className="skill-table-wrap"
                          tabIndex={0}
                          role="region"
                          aria-label="技能表（横スクロール）"
                        >
                          <table
                            className="skill-table"
                            aria-label="技能と割り振りポイント"
                          >
                            <thead>
                              <tr>
                                <th>技能名</th>
                                <th>初期</th>
                                <th>職業</th>
                                <th>興味</th>
                                <th>成長</th>
                                <th>合計</th>
                                {c.edition === "7" && (
                                  <>
                                    <th>½</th>
                                    <th>⅕</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {sortSkills(c.skills)
                                .filter(
                                  (s) =>
                                    s.name.includes(search) &&
                                    (category === "すべて" ||
                                      s.category === category) &&
                                    (!allocatedOnly ||
                                      s.occupation + s.interest + s.growth > 0),
                                )
                                .map((s) => (
                                  <tr
                                    key={s.id}
                                    className={
                                      s.occupation + s.interest > 0
                                        ? "skill-trained"
                                        : ""
                                    }
                                  >
                                    <td>
                                      {s.custom ? (
                                        <div className="custom-skill-name">
                                          <input
                                            aria-label="自由技能名"
                                            maxLength={100}
                                            value={s.name}
                                            onChange={(e) =>
                                              updateSkill(s.id, {
                                                name:
                                                  e.target.value ||
                                                  "新しい技能",
                                              })
                                            }
                                          />
                                          <button
                                            className="icon-button"
                                            aria-label={`${s.name}を削除`}
                                            onClick={() =>
                                              update({
                                                skills: c.skills.filter(
                                                  (x) => x.id !== s.id,
                                                ),
                                              })
                                            }
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <SkillNameInput
                                            skill={s}
                                            onChange={(name) =>
                                              updateSkill(s.id, { name })
                                            }
                                          />
                                          {s.name === "クトゥルフ神話" && (
                                            <small className="mythos-note">
                                              成長のみ
                                            </small>
                                          )}
                                        </>
                                      )}
                                    </td>
                                    <td>
                                      {s.custom ? (
                                        <NumberInput
                                          aria-label={`${s.name}の初期値`}
                                          min={0}
                                          max={99}
                                          value={s.base}
                                          onValueChange={(base) =>
                                            updateSkill(s.id, { base })
                                          }
                                        />
                                      ) : (
                                        skillBase(s, c)
                                      )}
                                    </td>
                                    {(
                                      [
                                        "occupation",
                                        "interest",
                                        "growth",
                                      ] as const
                                    ).map((key, i) => (
                                      <td key={key}>
                                        <NumberInput
                                          aria-label={`${s.name}の${["職業", "興味", "成長"][i]}ポイント`}
                                          min={0}
                                          max={99}
                                          value={s[key]}
                                          disabled={
                                            s.name === "クトゥルフ神話" &&
                                            key !== "growth"
                                          }
                                          onValueChange={(points) =>
                                            updateSkill(s.id, { [key]: points })
                                          }
                                        />
                                      </td>
                                    ))}
                                    <td
                                      className={
                                        skillTotal(s, c) > 99
                                          ? "total-error"
                                          : "skill-total"
                                      }
                                    >
                                      {skillTotal(s, c)}
                                      <small>%</small>
                                    </td>
                                    {c.edition === "7" && (
                                      <>
                                        <td>
                                          {Math.floor(skillTotal(s, c) / 2)}
                                        </td>
                                        <td>
                                          {Math.floor(skillTotal(s, c) / 5)}
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {!c.skills.some(
                          (s) =>
                            s.name.includes(search) &&
                            (category === "すべて" ||
                              s.category === category) &&
                            (!allocatedOnly ||
                              s.occupation + s.interest + s.growth > 0),
                        ) && (
                          <div className="empty-search">
                            該当する技能がありません。
                          </div>
                        )}
                        <div className="panel-note">
                          <BookOpen size={14} />
                          技能は五十音順に表示。括弧内は自由に入力できます。
                        </div>
                      </section>
                    </>
                  )}
                  {tab === "story" && (
                    <section className="panel glass">
                      <SectionTitle
                        number="04"
                        title="バックストーリー"
                        sub="容姿や信念などを自由に入力できます。"
                      />
                      <div className="story-grid">
                        {(
                          [
                            [
                              "appearance",
                              "容姿の描写",
                              "髪、目、体格、服装など。",
                            ],
                            [
                              "belief",
                              "イデオロギー／信念",
                              "信念や価値観を入力。",
                            ],
                            [
                              "importantPeople",
                              "重要な人々",
                              "家族、友人、恩人など。",
                            ],
                            [
                              "meaningfulPlaces",
                              "意味のある場所",
                              "出身地や思い出の場所など。",
                            ],
                            [
                              "treasuredPossessions",
                              "秘蔵の品",
                              "大切にしている所持品など。",
                            ],
                            [
                              "traits",
                              "特徴",
                              "性格、口癖、負傷、恐怖症など。",
                            ],
                          ] as const
                        ).map(([key, label, placeholder]) => (
                          <Field key={key} label={label}>
                            <textarea
                              value={c[key]}
                              maxLength={4000}
                              placeholder={placeholder}
                              rows={4}
                              onChange={(e) =>
                                update({ [key]: e.target.value })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    </section>
                  )}
                  {tab === "equipment" && (
                    <section className="panel glass">
                      <SectionTitle
                        number="05"
                        title="装備と探索の記録"
                        sub="所持品やセッション中の記録を入力できます。"
                      />
                      <Field label="装備と所持品" hint="EQUIPMENT">
                        <textarea
                          value={c.equipment}
                          placeholder="武器、持ち物、収入と財産など。"
                          rows={8}
                          maxLength={10000}
                          onChange={(e) =>
                            update({ equipment: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="セッションメモ" hint="SESSION NOTES">
                        <textarea
                          value={c.notes}
                          placeholder="探索の記録、出会った人々、学んだ呪文など。"
                          rows={10}
                          maxLength={20000}
                          onChange={(e) => update({ notes: e.target.value })}
                        />
                      </Field>
                    </section>
                  )}
                </div>
                <aside className="summary-column">
                  <section className="summary-card glass">
                    <div className="summary-label">
                      <span>探索者サマリー</span>
                      <span className="summary-edition">第{c.edition}版</span>
                    </div>
                    <div className="summary-identity">
                      <div className="summary-avatar">
                        {portraitUrl ? (
                          <img
                            key={portraitUrl}
                            src={portraitUrl}
                            alt="探索者の画像"
                          />
                        ) : (
                          <UserRound size={28} strokeWidth={1.3} />
                        )}
                        <span />
                      </div>
                      <h3>{c.name || "名前のない探索者"}</h3>
                      <p>{c.occupation || "職業未設定"}</p>
                      {c.player && <small>PLAYER · {c.player}</small>}
                    </div>
                    <div className="summary-divider" />
                    <div className="vitals">
                      <div>
                        <span>
                          <Heart size={13} />
                          HP
                        </span>
                        <b>
                          {c.currentHP ?? d.hp}
                          <small>/ {d.hp}</small>
                        </b>
                      </div>
                      <div>
                        <span>
                          <Zap size={13} />
                          MP
                        </span>
                        <b>
                          {c.currentMP ?? d.mp}
                          <small>/ {d.mp}</small>
                        </b>
                      </div>
                      <div>
                        <span>
                          <Shield size={13} />
                          SAN
                        </span>
                        <b>
                          {c.currentSAN ?? d.san}
                          <small>/ {d.maxSAN}</small>
                        </b>
                      </div>
                    </div>
                    <div className="summary-stats">
                      {statKeys.map((k) => (
                        <div key={k}>
                          <span>{k}</span>
                          <b>{c.stats[k] || "—"}</b>
                        </div>
                      ))}
                    </div>
                    <div className="summary-points">
                      <div>
                        <span>
                          <i className="point-dot" />
                          職業ポイント
                        </span>
                        <b className={usedOp > op ? "text-error" : ""}>
                          {op - usedOp}
                          <small> / {op}</small>
                        </b>
                      </div>
                      <div>
                        <span>
                          <i className="point-dot green" />
                          興味ポイント
                        </span>
                        <b className={usedIp > ip ? "text-error" : ""}>
                          {ip - usedIp}
                          <small> / {ip}</small>
                        </b>
                      </div>
                      <span className="remaining-label">残りポイント</span>
                    </div>
                    <button
                      className="summary-preview"
                      onClick={() => openModal("preview")}
                    >
                      <Eye size={15} />
                      キャラクターシートを確認
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="completion glass">
                    <div>
                      <span>入力状況</span>
                      <b>
                        {progress}
                        <small> / 5</small>
                      </b>
                    </div>
                    <div className="completion-track">
                      <span style={{ width: `${progress * 20}%` }} />
                    </div>
                    <p>{`${progress}項目を入力済み`}</p>
                  </section>
                  {errors.length > 0 && (
                    <div className="validation-alert" role="alert">
                      {errors.map((e) => (
                        <p key={e}>{e}</p>
                      ))}
                    </div>
                  )}
                  <div className="data-actions">
                    <button onClick={exportJSON}>
                      <Download size={13} />
                      JSON出力
                    </button>
                    <button onClick={() => fileRef.current?.click()}>
                      <Upload size={13} />
                      読み込み
                    </button>
                    <button
                      aria-label="探索者を削除"
                      onClick={() => openModal("delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer className="page-footer">
            <div className="footer-brand">
              <Logo small />
              <span>Arkhive</span>
            </div>
            <a
              href="https://product.kadokawa.co.jp/cthulhu/contents/coc_material/"
              target="_blank"
              rel="noreferrer"
            >
              公式探索者シート
              <ArrowRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      <input
        type="file"
        ref={imageRef}
        hidden
        aria-label="探索者の画像を選択"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void uploadImage(file);
        }}
      />
      <input
        type="file"
        ref={fileRef}
        hidden
        accept=".json,application/json"
        onChange={(e) => void importJSON(e.target.files?.[0])}
      />
      {toast && (
        <div
          className={`toast ${toast.kind === "error" ? "toast-error" : ""}`}
          role="status"
        >
          {toast.kind === "error" ? (
            <CircleHelp size={18} />
          ) : (
            <CheckCheck size={18} />
          )}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="通知を閉じる"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <ModalFrame
          key={modal}
          title={
            modal === "ccfolia"
              ? "CCFOLIAコマ出力"
              : modal === "new"
                ? "新しい探索者をつくる"
                : modal === "sharing"
                  ? "キャラクターシートの公開設定"
                  : modal === "mcp"
                    ? "MCP連携"
                    : modal === "preview"
                      ? "探索者シート"
                      : modal === "delete"
                        ? "探索者を削除"
                        : modal === "edition"
                          ? "ルールの版を切り替える"
                          : "使い方・サイトについて"
          }
          onClose={() => setModal(null)}
          wide={modal === "preview"}
          returnFocus={modalTrigger.current}
        >
          {modal === "ccfolia" && (
            <>
              <p className="modal-description" role="status">
                自動コピーできませんでした。下のJSONを選択してコピーし、ココフォリアのルームの盤面に貼り付けてください。
              </p>
              <label className="ccfolia-json-label">
                コマのJSON
                <textarea
                  className="ccfolia-json"
                  readOnly
                  rows={10}
                  value={ccfoliaJSON}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                />
              </label>
              <p className="modal-description">
                出力ボタンを押した時点の内容です。画像・メモ・プロフィールは含みません。
              </p>
            </>
          )}
          {modal === "sharing" && (
            <>
              <p className="modal-description">
                公開すると、URLを知っている人はログインなしでシート全体（画像・プレイヤー名・メモを含む）を閲覧できます。編集と公開設定の変更は管理者だけが行えます。
              </p>
              {!user ? (
                <div className="info-note">
                  公開するには<a href="/auth/discord">Discordでログイン</a>
                  してください。
                </div>
              ) : (
                <>
                  {sharingError && (
                    <p role="alert" className="sharing-error">
                      {sharingError}
                    </p>
                  )}
                  {sharing?.id === c.id ? (
                    <>
                      <p className="sharing-status">
                        現在：{sharing.shareId ? "公開中" : "非公開"}
                      </p>
                      {sharing.shareId ? (
                        <>
                          <label className="sharing-url">
                            公開URL
                            <input
                              readOnly
                              value={`${location.origin}/shared/${sharing.shareId}`}
                              onFocus={(e) => e.target.select()}
                            />
                          </label>
                          <div className="sharing-actions">
                            <button
                              className="button button-white"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(
                                    `${location.origin}/shared/${sharing.shareId}`,
                                  )
                                  .then(() => notify("公開URLをコピーしました"))
                                  .catch(() =>
                                    notify(
                                      "URLを選択してコピーしてください",
                                      "error",
                                    ),
                                  );
                              }}
                            >
                              <Link2 size={15} />
                              URLをコピー
                            </button>
                            <a
                              className="button button-white"
                              href={`/shared/${sharing.shareId}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              公開ページを開く
                            </a>
                          </div>
                          <p className="modal-description">
                            クラウドに保存した内容が公開ページに反映されます。公開停止後はこのURLと画像を閲覧できなくなり、再公開時には新しいURLが発行されます。
                          </p>
                          <button
                            className="button button-white modal-primary"
                            disabled={sharingBusy || saving || !!imageBusy}
                            onClick={() => void changeSharing(false)}
                          >
                            {sharingBusy ? "変更中…" : "公開を停止する"}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="modal-description">
                            現在の内容をクラウドに保存して公開します。
                          </p>
                          <button
                            className="button button-primary modal-primary"
                            disabled={sharingBusy || saving || !!imageBusy}
                            onClick={() => void changeSharing(true)}
                          >
                            {sharingBusy ? "公開中…" : "保存して公開する"}
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    !sharingError && (
                      <p role="status">公開設定を読み込んでいます…</p>
                    )
                  )}
                </>
              )}
            </>
          )}
          {modal === "new" && (
            <>
              <p className="modal-description">
                使用するルールを選択してください。
              </p>
              <div className="edition-options">
                {(["7", "6"] as Edition[]).map((e) => (
                  <button
                    key={e}
                    aria-pressed={newEdition === e}
                    className={newEdition === e ? "edition-selected" : ""}
                    onClick={() => setNewEdition(e)}
                  >
                    <BookOpen size={25} />
                    <strong>
                      {e === "7"
                        ? "新クトゥルフ神話TRPG"
                        : "クトゥルフ神話TRPG"}
                    </strong>
                    <span>
                      第{e}版 {e === "6" ? "· クラシック" : ""}
                    </span>
                    {newEdition === e && <Check size={17} />}
                  </button>
                ))}
              </div>
              <button
                className="button button-primary modal-primary"
                onClick={() => create(newEdition)}
              >
                <Plus size={17} />
                探索者ノートを作成
              </button>
            </>
          )}
          {modal === "edition" && (
            <>
              <p className="modal-description">
                第{c.edition === "7" ? "6" : "7"}版へ切り替えます。能力値を
                {c.edition === "7" ? "1/5" : "5倍"}
                に換算し、技能一覧と割り振りポイントを初期化します。
                <br />
                現在の内容を残す場合は、先にJSON出力してください。
              </p>
              <button
                className="button button-primary modal-primary"
                onClick={switchEdition}
              >
                第{c.edition === "7" ? "6" : "7"}版に切り替え
              </button>
            </>
          )}
          {modal === "delete" && (
            <>
              <p className="modal-description">
                「{c.name || "名前のない探索者"}
                」を端末とクラウドから削除します。この操作は取り消せません。必要な場合は先にJSON出力してください。
              </p>
              <div className="modal-actions">
                <button className="button button-white" onClick={exportJSON}>
                  <Download size={16} />
                  JSON出力
                </button>
                <button
                  className="button button-danger"
                  onClick={() => void remove()}
                  disabled={!!imageBusy || saving}
                >
                  <Trash2 size={16} />
                  削除する
                </button>
              </div>
            </>
          )}
          {modal === "help" && (
            <>
              <div className="welcome-logo">
                <Logo />
              </div>
              <p className="modal-description">
                クトゥルフ神話TRPGの第6版・第7版に対応しています。能力値はダイスボタンから自動入力。技能は職業・興味ポイントを分けて管理できます。
              </p>
              <div className="help-step">
                <span>01</span>
                <p>
                  <b>端末への保存</b>
                  <small>
                    編集内容はこのブラウザーに自動保存。JSONでバックアップできます。
                  </small>
                </p>
              </div>
              <div className="help-step">
                <span>02</span>
                <p>
                  <b>クラウドへの保存</b>
                  <small>
                    ログイン後「クラウドに保存」で保存。他の端末からも開けます。
                  </small>
                </p>
              </div>
              <div className="help-step">
                <span>03</span>
                <p>
                  <b>MCP連携</b>
                  <small>
                    ChatGPTやClaudeにMCPのURLを追加し、接続時にDiscordでログインして連携を許可。
                  </small>
                </p>
              </div>
              {!user &&
                (configured ? (
                  <a
                    className="button button-primary modal-primary"
                    href="/auth/discord"
                  >
                    <DiscordIcon />
                    Discordでログイン
                  </a>
                ) : (
                  <div className="info-note">
                    Discordログインは準備中です。運営者がDiscord Developer
                    Portalでアプリを作成し、Client ID・Client
                    Secretを設定すると有効になります。
                  </div>
                ))}
              <p className="copyright">
                非公式のファンツールです。ルールの詳細と年齢補正は基本ルールブックをご確認ください。
                <br />
                Call of Cthulhu © Chaosium Inc. / 日本語版 KADOKAWA
                <br />
                <a
                  href="https://product.kadokawa.co.jp/cthulhu/contents/coc_material/"
                  target="_blank"
                  rel="noreferrer"
                >
                  技能名・初期値の参照元：公式探索者シート
                </a>
              </p>
            </>
          )}
          {modal === "mcp" && (
            <>
              <div className="mcp-badge">
                <Code2 size={24} />
                <span>MCP SERVER</span>
              </div>
              <p className="modal-description">
                ChatGPTやClaudeから探索者を作成・取得・更新。接続時にDiscordでログインして、あなたの探索者へのアクセスを許可します。
              </p>
              <Field label="MCPエンドポイント">
                <div className="copy-input">
                  <input readOnly value={`${location.origin}/mcp`} />
                  <button
                    className="icon-button"
                    aria-label="エンドポイントをコピー"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(`${location.origin}/mcp`)
                        .then(() => notify("URLをコピーしました"))
                        .catch(() =>
                          notify(
                            "コピーできません。URLを選択してください",
                            "error",
                          ),
                        )
                    }
                  >
                    <Link2 size={16} />
                  </button>
                </div>
              </Field>
              <div className="mcp-tools">
                {[
                  "get_rules",
                  "list_characters",
                  "get_character",
                  "create_character",
                  "update_character",
                ].map((x) => (
                  <code key={x}>{x}</code>
                ))}
              </div>
              <div className="help-step">
                <span>01</span>
                <p>
                  <b>クライアントにURLを追加</b>
                  <small>
                    ChatGPTやClaudeのMCP連携設定に、上のエンドポイントを登録します。認証方式を選べる場合はOAuthを指定してください。
                  </small>
                </p>
              </div>
              <div className="help-step">
                <span>02</span>
                <p>
                  <b>Discordでログインして連携</b>
                  <small>
                    接続元と許可する操作を確認し、「Discordでログインして連携」へ進みます。ログイン済みの場合は「連携を許可」で完了します。
                  </small>
                </p>
              </div>
              <div className="info-note">
                クラウドに保存した探索者を利用できます。端末だけに保存している探索者は、先に「クラウドに保存」してください。
              </div>
              {user ? (
                <>
                  <h3>接続済みアプリ</h3>
                  {!connections.length && (
                    <p className="modal-description">
                      接続済みのアプリはありません。
                    </p>
                  )}
                  {connections.map((connection) => (
                    <div className="connection-row" key={connection.id}>
                      <span>
                        {connection.name}
                        <small>
                          {new Date(connection.created_at).toLocaleDateString(
                            "ja-JP",
                          )}{" "}
                          に連携
                        </small>
                      </span>
                      <button
                        className="text-button text-error"
                        onClick={async () => {
                          try {
                            await api(`/api/connections/${connection.id}`, {
                              method: "DELETE",
                            });
                            setConnections((xs) =>
                              xs.filter((x) => x.id !== connection.id),
                            );
                            notify("アプリの連携を解除しました");
                          } catch (e) {
                            notify((e as Error).message, "error");
                          }
                        }}
                      >
                        連携解除
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <div className="info-note">
                  接続済みアプリの確認・解除は、
                  <a href="/auth/discord">Discordでログイン</a>
                  すると利用できます。
                </div>
              )}
              <p className="copyright">
                Streamable HTTP /
                OAuth対応。連携の有効期間は30日です。期限が切れたらクライアントから再連携してください。
              </p>
            </>
          )}
          {modal === "preview" && (
            <>
              <div className="preview-actions">
                <button
                  className="button button-white preview-ccfolia"
                  onClick={() => void exportCcfolia()}
                  disabled={copyingCcfolia}
                  aria-busy={copyingCcfolia}
                >
                  <Copy size={15} />
                  CCFOLIAコマ出力
                </button>
                <button className="button button-white" onClick={exportJSON}>
                  <Download size={15} />
                  JSON出力
                </button>
                <button
                  className="button button-primary"
                  onClick={() => window.print()}
                >
                  <FileText size={15} />
                  印刷 / PDF
                </button>
              </div>
              <CharacterSheet c={c} portraitUrl={portraitUrl} />
            </>
          )}
        </ModalFrame>
      )}
      {loading && (
        <div className="loading-indicator" role="status">
          <LoaderCircle size={16} className="spin" />
          データを読み込んでいます…
        </div>
      )}
    </>
  );
  function StatsPanel({ compact = false }: { compact?: boolean }) {
    return (
      <section
        className={`panel glass stats-panel ${compact ? "stats-compact" : ""}`}
      >
        <div className="stats-heading">
          <SectionTitle
            number="02"
            title="能力値"
            sub="一括ロール・個別ロール・直接入力に対応。"
          />
          <button
            className={`button button-lavender ${rolling === "all" ? "rolling" : ""}`}
            onClick={() => roll()}
            disabled={!!rolling}
          >
            <Dices size={17} />
            まとめてロール
          </button>
        </div>
        <div className="stats-grid">
          {statKeys.map((k) => (
            <div
              className={`stat-card ${rolling === k || rolling === "all" ? "stat-rolling" : ""}`}
              key={k}
            >
              <div>
                <strong>{k}</strong>
                <button
                  aria-label={`${k}をダイスロール`}
                  className="stat-dice"
                  onClick={() => roll(k)}
                  disabled={!!rolling}
                >
                  <Dices size={15} />
                </button>
              </div>
              <label htmlFor={`stat-${k}`}>{statLabels[k]}</label>
              <NumberInput
                id={`stat-${k}`}
                aria-label={k}
                min={0}
                max={999}
                value={c.stats[k]}
                emptyWhenZero
                placeholder="—"
                onValueChange={(value) =>
                  update({ stats: { ...c.stats, [k]: value } })
                }
              />
              <small>
                {c.edition === "7"
                  ? "½ " +
                    Math.floor(c.stats[k] / 2) +
                    "　⅕ " +
                    Math.floor(c.stats[k] / 5)
                  : k === "SIZ" || k === "INT"
                    ? "2D6+6"
                    : k === "EDU"
                      ? "3D6+3"
                      : "3D6"}
              </small>
            </div>
          ))}
        </div>
        <div className="roll-footer">
          <span aria-live="polite">
            {lastRoll ? (
              <>
                <Dices size={13} />
                {lastRoll}
              </>
            ) : (
              <>
                <CircleHelp size={13} />
                ダイスアイコンで個別ロール。数値を直接編集することもできます。
              </>
            )}
          </span>
          {c.edition === "7" && (
            <button
              className="luck-roll"
              onClick={() => roll("LUCK")}
              disabled={!!rolling}
            >
              <Sparkles size={13} />
              幸運 <b>{c.luck || "—"}</b>
              <Dices size={14} />
            </button>
          )}
        </div>
        {!compact && (
          <div className="info-note">
            第{c.edition}版のダイス式を使用。
            {c.edition === "7"
              ? "SIZ・INT・EDUは（2D6+6）×5、その他は3D6×5。"
              : "SIZ・INTは2D6+6、EDUは3D6+3、その他は3D6。"}
            ロール後も値を調整できます。
          </div>
        )}
      </section>
    );
  }
}
function DiscordIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19.73 5.1a18 18 0 0 0-4.46-1.38l-.56 1.12a16.7 16.7 0 0 0-5.42 0l-.56-1.12A18 18 0 0 0 4.27 5.1C1.45 9.28.69 13.36 1.07 17.38a18 18 0 0 0 5.46 2.76l1.14-1.85-1.73-.83.43-.33a12.8 12.8 0 0 0 11.26 0l.43.33-1.73.83 1.14 1.85a18 18 0 0 0 5.46-2.76c.45-4.66-.78-8.7-3.2-12.28ZM8.52 14.92c-1.05 0-1.9-.96-1.9-2.14s.83-2.14 1.9-2.14 1.93.97 1.9 2.14c0 1.18-.84 2.14-1.9 2.14Zm6.96 0c-1.05 0-1.9-.96-1.9-2.14s.83-2.14 1.9-2.14 1.93.97 1.9 2.14c0 1.18-.84 2.14-1.9 2.14Z" />
    </svg>
  );
}
function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}
function SectionTitle({
  number,
  title,
  sub,
}: {
  number?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="section-title">
      {number && <span className="section-number">{number}</span>}
      <div>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}
function PointBar({
  label,
  used,
  total,
  green = false,
}: {
  label: string;
  used: number;
  total: number;
  green?: boolean;
}) {
  return (
    <div
      className={`point-bar ${green ? "point-bar-green" : ""} ${used > total ? "point-over" : ""}`}
    >
      <div>
        <span>{label}</span>
        <b>
          {used}
          <small> / {total}</small>
        </b>
      </div>
      <div className="point-track">
        <span
          style={{
            width: `${total ? Math.min(100, (used / total) * 100) : 0}%`,
          }}
        />
      </div>
      <small>残り {total - used} pt</small>
    </div>
  );
}
function ModalFrame({
  title,
  onClose,
  wide,
  returnFocus,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  returnFocus?: HTMLElement | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    const el = ref.current;
    el?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const all = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),textarea,select,[tabindex="0"]',
        ),
      );
      const first = all[0],
        last = all.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === el)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el?.addEventListener("keydown", trap);
    return () => {
      el?.removeEventListener("keydown", trap);
      if (
        previous?.isConnected &&
        previous !== document.body &&
        getComputedStyle(previous).visibility !== "hidden"
      )
        previous.focus();
      else if (window.matchMedia("(max-width: 760px)").matches)
        document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
      else document.getElementById("main-content")?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-card ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="閉じる" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  publicShareId !== null ? (
    <PublicCharacter shareId={publicShareId} />
  ) : (
    <App />
  ),
);
