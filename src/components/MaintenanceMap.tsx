import type { KeyboardEvent } from "react";
import type { Instance } from "../../backend/src/planning/types";
import { lineColor, sectorKey, stationKey, summarise } from "../lib/network-map";
import type { FeatureKey, Impact, NetworkLayout } from "../lib/network-map";

const WORK = "#FFC400";
const INK = "#111111";
const PAPER = "#FAFAF7";

interface Props {
  instance: Instance;
  layout: NetworkLayout;
  /** Impacts per station/sector after filtering. */
  impacts: Map<FeatureKey, Impact[]>;
  selected: FeatureKey | null;
  onSelect: (key: FeatureKey | null) => void;
}

const describe = (name: string, work: number, closure: number) => {
  const parts = [work && `${work} ${work === 1 ? "activity" : "activities"} working`, closure && `${closure} ${closure === 1 ? "closure" : "closures"}`].filter(Boolean);
  return `${name}: ${parts.length ? parts.join(", ") : "no maintenance"}`;
};

export default function MaintenanceMap({ instance, layout, impacts, selected, onSelect }: Props) {
  const lineName = (code: string) => instance.lines.find((l) => l.line_code === code)?.line_name ?? code;
  const maxWork = Math.max(0, ...[...impacts.values()].map((list) => summarise(list).work));
  const anyWork = maxWork > 0;
  // Busier places get a stronger highlight, but never so faint that work is hard to see.
  const heat = (work: number) => 0.35 + 0.65 * (work / Math.max(maxWork, 1));
  const activate = (key: FeatureKey) => ({
    tabIndex: 0, role: "button" as const, "aria-pressed": selected === key,
    onClick: () => onSelect(selected === key ? null : key),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === key ? null : key); } },
  });

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full min-w-[560px] select-none" role="group" aria-label="Network map. Highlighted stations and segments have planned maintenance.">
      {layout.sectors.map((s) => {
        const key = sectorKey(s.id); const { work, status } = summarise(impacts.get(key) ?? []);
        if (status === "none" && selected !== key) return null;
        return (
          <g key={`halo-${s.id}`} pointerEvents="none" strokeLinecap="round" fill="none">
            {selected === key && <><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={INK} strokeWidth={29} /><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={PAPER} strokeWidth={26} /></>}
            {status === "work" && <><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={INK} strokeWidth={19} /><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={WORK} strokeWidth={15} opacity={heat(work)} /></>}
            {status === "closure" && <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={INK} strokeOpacity={0.35} strokeWidth={15} strokeDasharray="3 5" />}
          </g>
        );
      })}

      {layout.sectors.map((s) => {
        const key = sectorKey(s.id); const { work, closure, status } = summarise(impacts.get(key) ?? []);
        const label = describe(`Segment ${s.from} to ${s.to}, ${lineName(s.line)}`, work, closure);
        return (
          <g key={s.id} {...activate(key)} aria-label={label} className="group cursor-pointer outline-none">
            <title>{label}</title>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={22} />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={lineColor(instance, s.line)} strokeWidth={6} strokeLinecap="round" opacity={anyWork && status === "none" ? 0.4 : 1} className="transition-opacity group-hover:opacity-100 group-focus-visible:[stroke-width:9]" />
          </g>
        );
      })}

      {layout.stations.map((st) => {
        const key = stationKey(st.id); const { work, closure, status } = summarise(impacts.get(key) ?? []);
        const label = describe(`Station ${st.id}${st.interchange ? " (interchange)" : ""}, ${st.lines.map(lineName).join(" and ")}`, work, closure);
        return (
          <g key={st.id} {...activate(key)} aria-label={label} className="group cursor-pointer outline-none">
            <title>{label}</title>
            {selected === key && <circle cx={st.x} cy={st.y} r={st.interchange ? 20 : 17} fill="none" stroke={INK} strokeWidth={2.5} />}
            {status === "work" && <><circle cx={st.x} cy={st.y} r={st.interchange ? 15 : 12} fill={PAPER} stroke={INK} strokeWidth={1.5} /><circle cx={st.x} cy={st.y} r={st.interchange ? 15 : 12} fill={WORK} opacity={heat(work)} /></>}
            {status === "closure" && <circle cx={st.x} cy={st.y} r={st.interchange ? 15 : 12} fill="none" stroke={INK} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="3 3" />}
            <circle cx={st.x} cy={st.y} r={22} fill="transparent" />
            <circle cx={st.x} cy={st.y} r={st.interchange ? 9 : 6} fill={PAPER} stroke={INK} strokeWidth={st.interchange ? 2.5 : 2} className="transition-all group-hover:[stroke-width:4] group-focus-visible:[stroke-width:4]" />
            {st.interchange && <circle cx={st.x} cy={st.y} r={3} fill={INK} />}
          </g>
        );
      })}

      {layout.stations.map((st) => (
        <text key={`label-${st.id}`} x={st.labelX} y={st.labelY} textAnchor={st.anchor} pointerEvents="none" className="fill-ink/70 font-mono" fontSize={11} fontWeight={st.interchange ? 700 : 500}>{st.id}</text>
      ))}

      {/* Activity counts, drawn last so they sit on top of the line. */}
      {[...layout.sectors.map((s) => ({ key: sectorKey(s.id), ...s.badge })), ...layout.stations.map((s) => ({ key: stationKey(s.id), ...s.badge }))].map(({ key, x, y }) => {
        const { work } = summarise(impacts.get(key) ?? []);
        if (!work) return null;
        return (
          <g key={`count-${key}`} pointerEvents="none">
            <circle cx={x} cy={y} r={8} fill={INK} />
            <text x={x} y={y + 3.5} textAnchor="middle" fill={PAPER} fontSize={10} fontWeight={700} className="font-mono">{work}</text>
          </g>
        );
      })}
    </svg>
  );
}
