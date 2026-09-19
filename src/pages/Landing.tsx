import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, FileCheck2, FileUp, GitBranch, MapPinned, SlidersHorizontal, TrainFront, UserRoundPen } from "lucide-react";
import TransitMap from "../components/TransitMap";
import { TrackDivider, StationDot } from "../components/transit";
import { Button } from "../components/ui";

const TICKER_ITEMS = [
  "EIGHT INPUT CSVs",
  "SCENARIOS A · B · C",
  "WEEKLY POSSESSIONS",
  "LOCAL FEASIBILITY CHECKS",
  "DISRUPTION REPLANNING",
  "SUBMISSION EXPORTS",
];

const FEATURES = [
  {
    icon: FileUp,
    color: "#9900AA",
    title: "Load the demand book",
    body: "Upload the eight published instance CSVs or load the public dataset. The planner reads contracts, activities, network locations, supply and safety rules together.",
  },
  {
    icon: CalendarDays,
    color: "#005EC4",
    title: "Compare three policies",
    body: "Run scenarios A, B and C on the same instance. Inspect weekly placements, contract completion, access units, overrun and added supply side by side.",
  },
  {
    icon: FileCheck2,
    color: "#D42E12",
    title: "Check and export",
    body: "Review local feasibility checks and recheck the exported CSVs. Download SCHEDULE_ACCESS, SCHEDULE_OCCUPANCY and RESULTS for the selected scenario.",
  },
  {
    icon: UserRoundPen,
    color: "#009645",
    title: "Request and Status",
    body: "Add or edit an activity in Request, then inspect its workload, placements and completion in Status. Input edits mark the schedule stale until you rerun it.",
  },
  {
    icon: MapPinned,
    color: "#FA9E0D",
    title: "Explore the network",
    body: "Use the Map to inspect planned work and closures by line, bound, week or contract, with location details connected to the loaded instance.",
  },
  {
    icon: SlidersHorizontal,
    color: "#9D5B25",
    title: "Test what-if changes",
    body: "Preview supply, workfront or workload edits against the current schedule before applying them to the shared planning instance.",
  },
  {
    icon: GitBranch,
    color: "#4D6A7A",
    title: "Replan disruptions",
    body: "Reduce capacity mid-horizon, keep unaffected earlier work in place, and compare the resulting schedule with the baseline before committing the change.",
  },
];

export default function Landing() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const update = () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      setProgress(p);
      const maxShift = Math.max(0, track.scrollWidth - window.innerWidth + 48);
      setShift(p * maxShift);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="block h-[26px] w-[26px] overflow-hidden rounded-[7px]">
              <img src="/cascade-logo.png" alt="Cascade logo" className="h-full w-full scale-[1.14] object-cover" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-[0.08em]">CASCADE</span>
          </div>
          <Link to="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 pb-16 pt-16 sm:pt-24 lg:grid-cols-2">
          <div className="relative z-10">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-ink/50">
              Railway Track Access Planner
            </p>
            <h1 className="mt-5 text-6xl font-black leading-[0.98] tracking-tight sm:text-7xl">
              Plan the work.
              <br />
              Protect the
              <br />
              network.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink/60">
              Cascade turns eight planning CSVs into weekly track possessions. Compare three scheduling policies, inspect the impact of each placement, test disruptions and export results in the published submission format.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/login">
                <Button size="lg">
                  Enter Cascade <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <span className="font-mono text-xs text-ink/45">NORTH–SOUTH · EAST–WEST ACCESS</span>
            </div>
          </div>
          <div className="relative">
            <TransitMap className="w-full" />
          </div>
        </div>

        {/* ticker */}
        <div className="border-y border-ink/10 bg-white py-3">
          <div className="flex w-max animate-ticker gap-8 whitespace-nowrap">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="flex items-center gap-8 font-mono text-[11px] font-semibold tracking-[0.25em] text-ink/60">
                {item}
                <StationDot color={Object.values({ a: "#D42E12", b: "#009645", c: "#9900AA", d: "#FA9E0D", e: "#005EC4", f: "#9D5B25" })[i % 6]} />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* planning preview */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-ink/50">The output</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight">A weekly plan you can inspect.</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/60">
              Follow activities across the planning horizon, see contract completion and understand why work moves.
              Cascade's checks flag hard violations before you export each scenario's CSVs.
            </p>
            <p className="mt-6 rounded-2xl border border-ink/10 bg-white p-4 text-sm text-ink/65">
              <span className="font-semibold text-ink">One shared instance.</span> Request edits, Status, Dashboard,
              Map and What-If all reflect the selected scenario. Changed inputs require a fresh run.
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">Illustrative weekly view</p>
            <div className="mt-5 grid grid-cols-[minmax(130px,1fr)_repeat(6,minmax(24px,1fr))] gap-2 text-center text-xs">
              <span className="text-left font-semibold">Activity</span>
              {[1, 2, 3, 4, 5, 6].map(week => <span key={week} className="font-mono text-ink/50">W{week}</span>)}
              {[
                { name: "Track renewal", weeks: [1, 2, 4], color: "bg-line-green" },
                { name: "Signal works", weeks: [2, 3, 5], color: "bg-line-orange" },
                { name: "Cable inspection", weeks: [1, 4, 6], color: "bg-line-green" },
              ].map(activity => <div key={activity.name} className="contents">
                <span className="border-t border-ink/10 py-3 text-left font-medium">{activity.name}</span>
                {[1, 2, 3, 4, 5, 6].map(week => <span key={week} className="border-t border-ink/10 py-3">
                  {activity.weeks.includes(week) && <span className={`mx-auto block h-4 w-4 rounded ${activity.color}`} />}
                </span>)}
              </div>)}
            </div>
          </div>
        </div>
      </section>

      {/* workflow */}
      <section className="border-y border-ink/10 bg-white/70">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-ink/50">From demand to decision</p>
              <h2 className="mt-4 text-4xl font-black tracking-tight">A planning workflow for real constraints.</h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/60">
                Work from the published eight-file instance format. Cascade schedules contracted activities into shared
                possessions while accounting for capacity, safety buffers, predecessor order and completion targets.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { step: "01", title: "Load", body: "Import the official public dataset or upload all eight demand-book CSVs." },
                { step: "02", title: "Plan", body: "Run scenarios A, B and C and inspect the weekly access timeline and contract outcomes." },
                { step: "03", title: "Explore", body: "Review Status and Map, then preview input changes or mid-horizon disruptions in What-If." },
                { step: "04", title: "Export", body: "Recheck the selected result locally and download its three submission CSVs." },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-ink/10 bg-paper p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <span className="font-mono text-xs font-semibold text-ink/30">{item.step}</span>
                  <h3 className="mt-3 text-base font-bold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/60">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TrackDivider color="#111111" stations={5} animated className="mx-auto max-w-6xl px-6 opacity-30" />

      {/* features — horizontal rail driven by vertical scroll */}
      <section ref={sectionRef} className="relative" style={{ height: "360vh" }}>
        <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-ink/50">Under the hood</p>
                <h2 className="mt-4 text-4xl font-black tracking-tight">Everything around the plan.</h2>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/40">Scroll to ride the line →</p>
            </div>
            {/* progress rail */}
            <div className="relative mt-6 h-px w-full bg-ink/10">
              <div
                className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink transition-none"
                style={{ width: `${progress * 100}%` }}
              />
              <TrainFront
                className="absolute bottom-0 h-5 w-5 -translate-x-1/2 text-ink"
                strokeWidth={2.2}
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className="relative mt-10">
            {/* track line the cards ride on */}
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-ink/8" aria-hidden />
            <div
              ref={trackRef}
              className="flex w-max gap-4 px-6 will-change-transform"
              style={{ transform: `translateX(${-shift}px)` }}
            >
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className="group w-[320px] shrink-0 rounded-2xl border border-ink/10 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_12px_40px_rgba(0,0,0,0.10)] sm:w-[360px]"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${f.color}14`, color: f.color }}
                    >
                      <f.icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs text-ink/30">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/60">{f.body}</p>
                  <div className="mt-4 h-1 w-8 rounded-full transition-all group-hover:w-16" style={{ backgroundColor: f.color }} />
                </div>
              ))}
              {/* end-of-line marker */}
              <div className="flex w-[200px] shrink-0 items-center justify-center">
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/35">End of line</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-ink/10 bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-paper/50">Ready for tonight</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
            Turn the demand book into a defensible plan.
          </h2>
          <Link to="/login">
            <Button size="lg" className="mt-8 bg-paper text-ink hover:bg-paper/90">
              Enter Cascade <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="border-t border-paper/10 py-6 text-center font-mono text-[11px] text-paper/40">
          CASCADE · RAILWAY TRACK ACCESS PLANNER
        </div>
      </section>
    </div>
  );
}
