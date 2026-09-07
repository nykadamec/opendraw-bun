import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NavLink } from 'react-router-dom';
import { Sparkles, Image, Folder, Settings, Puzzle } from 'reicon-react';
import { fetchEcho } from '@opendraw/api-client';

const ICON_SIZE = 18;

function ConnectionDot() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await fetchEcho();
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const tooltip =
    connected === null
      ? 'Zjišťuji stav Draw Things…'
      : connected
        ? 'Draw Things připojen – generování je dostupné'
        : 'Draw Things není připojen – zkontroluj, že běží Draw Things';

  return (
    <span
      data-el-name="SidebarConnectionDot"
      role="status"
      title={tooltip}
      aria-label={tooltip}
      className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300 ${
        connected === null
          ? 'bg-txt-tertiary/40 animate-pulse'
          : connected
            ? 'bg-green-500'
            : 'bg-red-500 animate-pulse'
      }`}
    />
  );
}

function SidebarBrand({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div data-el-name="SidebarHeader" className={visible ? 'px-5 pt-5 pb-4' : 'p-5'}>
      <button
        type="button"
        data-el-name="LogoButton"
        onClick={onToggle}
        aria-expanded={visible}
        aria-label={visible ? 'Skrýt postranní panel' : 'Zobrazit postranní panel'}
        title={visible ? 'Skrýt postranní panel' : 'Zobrazit postranní panel'}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-[10px] p-[10px] transition-colors duration-200 ease-out ${
          visible ? 'bg-white' : 'bg-[rgba(255,255,255,0.4)] hover:bg-white'
        }`}
      >
        <span className="flex w-4 h-4 items-center justify-center text-[#111]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 13.99993896484375 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.62354 0.60156q-0.33496 0.02734-0.59473 0.23926-0.25977 0.2085-0.36914 0.51611-0.09912 0.2666-0.07178 0.51953 0.02734 0.11279 1.00147 3.84522 0.97412 3.729 1.01513 3.8418 0.09912 0.23584 0.31446 0.42724 0.21875 0.18799 0.48193 0.25635 0.12646 0.04443 1.69531 0.35205l1.56885 0.30762 0 0.18115q0 0.39307 0.22217 0.68701 0.05811 0.08203 0.60156 0.61524 0.43408 0.43408 0.58105 0.55371 0.14697 0.11963 0.31446 0.17431 0.09912 0.02734 0.16064 0.03418 0.06494 0.00684 0.20508 0.00684 0.14014 0 0.20166-0.00684 0.06494-0.00684 0.16064-0.03418 0.14014-0.04102 0.27344-0.1333 0.1333-0.09229 1.83545-1.79101 1.70215-1.70215 1.77734-1.82178 0.07861-0.11963 0.11963-0.25977 0.02734-0.0957 0.03418-0.15722 0.00684-0.06494 0.00684-0.20508 0-0.14014-0.00684-0.20166-0.00684-0.06494-0.03418-0.16064-0.05469-0.18457-0.18798-0.34522-0.1333-0.16064-0.59473-0.62207l-0.56055-0.56055-0.16748-0.06836q-0.15381-0.07178-0.25976-0.09912-0.10596-0.02734-0.25977-0.02734l-0.18115 0-0.30762-1.56885q-0.32471-1.58252-0.35205-1.69531-0.06836-0.26318-0.25977-0.47852-0.18799-0.21875-0.42382-0.31787-0.12646-0.04102-3.85205-1.01513-3.72217-0.97412-3.80762-0.9878l-0.12647-0.01367q-0.02734 0-0.1538 0.01367z m4.74755 2.36524q2.74121 0.71436 2.74805 0.72119 0.01025 0.00684 0.37256 1.85596l0.37939 1.84912-2.47802 2.47802-1.84912-0.37939q-1.84912-0.3623-1.85596-0.36914-0.00684-0.01025-0.82715-3.11719-0.81689-3.10693-0.81006-3.11377 0.00684-0.00684 1.39453 1.37744l1.38428 1.40137-0.04102 0.14014q-0.07178 0.16748-0.09228 0.27343-0.02051 0.10254-0.02051 0.3418 0.01367 0.21191 0.02051 0.28027 0.00684 0.06836 0.03418 0.18116 0.11279 0.36572 0.34863 0.65283 0.23926 0.28711 0.56397 0.44092 0.28027 0.14014 0.59472 0.17431 0.31445 0.03418 0.63575-0.05468 0.32129-0.09229 0.57421-0.27344 0.39307-0.29395 0.57422-0.72119 0.18115-0.42725 0.12305-0.89551-0.05469-0.47168-0.33154-0.84766-0.39307-0.51953-1.05274-0.65966-0.23584-0.04102-0.50928-0.02051-0.27344 0.02051-0.49902 0.11963l-0.08203 0.02734-2.78564-2.78564 3.48632 0.92285z m0.18116 2.88476q0.11279 0.01367 0.22216 0.1128 0.11279 0.09912 0.16065 0.20507 0.05127 0.10254 0.0581 0.23584 0.00684 0.1333-0.03418 0.23243-0.11279 0.22217-0.3247 0.31445-0.2085 0.08887-0.41699 0.00683-0.15381-0.05811-0.26661-0.19824-0.11279-0.14014-0.11279-0.34863 0-0.16748 0.08203-0.30078 0.08545-0.1333 0.22559-0.20166 0.07178-0.04443 0.16064-0.06494 0.09229-0.02051 0.14697-0.00684l0.09913 0.01367z m3.83496 4.53565l-1.63721 1.62353-0.92285-0.92285 3.26074-3.26074 0.92285 0.92285-1.62353 1.63721z"
              fill="#111111"
            />
          </svg>
        </span>
        <span
          data-el-name="AppTitle"
          className="font-display text-[15px] font-semibold tracking-[-0.3px] text-[#111] leading-none"
        >
          OpenDraw
        </span>
        <span className="ml-auto flex items-center">
          <ConnectionDot />
        </span>
      </button>
    </div>
  );
}

export interface SidebarNavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hint: string;
}

export const DESKTOP_NAV_ITEMS: SidebarNavItem[] = [
  { path: '/', label: 'Generovat', icon: Sparkles, hint: 'Nové zadání a generování obrázků' },
  { path: '/gallery', label: 'Galerie', icon: Image, hint: 'Hotové obrázky a jejich varianty' },
  { path: '/projects', label: 'Projekty', icon: Folder, hint: 'Uložené rozpracované sady' },
  { path: '/loras', label: 'LoRA', icon: Puzzle, hint: 'Styly a doplňkové modely' },
  { path: '/settings', label: 'Nastavení', icon: Settings, hint: 'Připojení, vzhled a úložiště' },
];

function SidebarNavLink({ item }: { item: SidebarNavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      data-el-name={`NavLink_${item.label}`}
      to={item.path}
      end={item.path === '/'}
      title={`${item.label} – ${item.hint}`}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-sm transition-colors duration-150 ${
          isActive
            ? 'bg-white/[0.08] text-white font-medium'
            : 'text-[#888] hover:text-white hover:bg-white/[0.05] font-normal'
        }`
      }
    >
      <span data-el-name="NavIcon" className="flex w-[18px] h-[18px] shrink-0 items-center justify-center">
        <Icon size={ICON_SIZE} />
      </span>
      <span data-el-name={`NavLabel_${item.label}`} className="leading-[1.43]">
        {item.label}
      </span>
    </NavLink>
  );
}

/* Postranní panel je vždy viditelný overlay podle návrhu AppWeb:
   240px, tmavé sklo + blur 40 + stín, výška podle obsahu, bez footeru.
   LogoButton funguje jako přepínač: klik schová/ukáže nav, stav persistuje v localStorage. */
const SIDEBAR_VISIBLE_KEY = 'opendraw.sidebarVisible';

export function DesktopSidebar() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_VISIBLE_KEY);
      return raw === null ? true : raw !== 'false';
    } catch {
      return true;
    }
  });
  /* Animace hraje vždy – bez ohledu na OS „Omezit pohyb". */
  const navTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(visible));
    } catch {
      /* localStorage nemusí být dostupný – stav pak vydrží jen do reloadu */
    }
  }, [visible]);

  return (
    <aside
      data-el-name="DesktopSidebar"
      className="sidebar-panel fixed left-[28px] top-[28px] z-30 flex h-fit w-60 flex-col overflow-visible scrollbar-none"
    >
      <SidebarBrand visible={visible} onToggle={() => setVisible((v) => !v)} />
      <div
        data-el-name="SidebarNavWrap"
        data-open={visible}
        aria-hidden={!visible}
        inert={!visible ? true : undefined}
      >
        <AnimatePresence initial={false}>
          {visible && (
            <motion.nav
              key="sidebar-nav"
              data-el-name="SidebarNav"
              aria-label="Hlavní navigace"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={navTransition}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-0.5 p-2">
                {DESKTOP_NAV_ITEMS.map((item) => (
                  <SidebarNavLink key={item.path} item={item} />
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

export default DesktopSidebar;
