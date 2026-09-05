import { useEffect, useState } from 'react';
import { useTheme } from '@opendraw/config-theme';
import { getGalleryStats, cleanGallery, configureDrawThingsAuth, getDrawThingsAuthStatus, logoutDrawThingsAuth } from '@opendraw/api-client';
import type { GalleryStats, DrawThingsAuthStatus } from '@opendraw/api-client';
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div data-el-name={`SettingsToggleRow_${label}`}
      role="button"
      tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!value);
        }
      }}
      aria-pressed={value}
      className={`flex items-center justify-between gap-3 p-3 min-h-[52px] rounded-2xl text-[15px] border cursor-pointer transition-colors ${
        value ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'
      }`}
    >
      <span data-el-name={`SettingsToggleLabel_${label}`} className="text-txt-primary">{label}</span>
      <span data-el-name="SettingsToggleTrack"
        className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${
          value ? 'bg-txt-primary' : 'bg-border'
        }`}
      >
        <span data-el-name="SettingsToggleKnob"
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-canvas transition-transform ${
            value ? 'translate-x-[20px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  cols = 3,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div data-el-name={`SettingsChoiceRow_${label}`}>
      <label data-el-name={`SettingsChoiceLabel_${label}`} className="text-[13px] text-txt-secondary mb-1.5 block">{label}</label>
      <div data-el-name={`SettingsChoiceOptions_${label}`} className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <div data-el-name={`SettingsChoiceOption_${label}_${opt.value}`}
              key={opt.value}
              role="button"
              tabIndex={0}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(opt.value);
                }
              }}
              aria-pressed={selected}
              className={`text-center min-h-[44px] flex items-center justify-center px-2 rounded-xl text-[13px] border cursor-pointer transition-colors ${
                selected
                  ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                  : 'bg-surface border-border text-txt-primary active:bg-border'
              }`}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmSheet({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        data-el-name="ConfirmSheetBackdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={() => { if (!busy) onClose(); }}
      />
      <div
        data-el-name="ConfirmSheetPanel"
        className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[24px] p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div data-el-name="ConfirmSheetHandle" className="min-h-[24px] flex items-center justify-center" aria-hidden>
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        <h3 data-el-name="ConfirmSheetTitle" className="text-[17px] font-semibold text-txt-primary mb-1">{title}</h3>
        <p data-el-name="ConfirmSheetMessage" className="text-[15px] text-txt-secondary mb-2">{message}</p>
        {error && (
          <p data-el-name="ConfirmSheetError" className="text-[13px] text-red-500 mb-2">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-h-[52px] rounded-2xl bg-surface border border-border text-txt-secondary text-[15px] active:bg-border transition-colors disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 min-h-[52px] rounded-2xl bg-red-500 text-white text-[15px] font-semibold active:opacity-80 transition-all disabled:opacity-50"
          >
            {busy ? 'Provádím…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

type PendingClean = 'all' | 'images' | 'metadata' | null;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const [storageLimitGb, setStorageLimitGb] = useState(() => {
    return parseFloat(localStorage.getItem('opendraw.maxStorageGb') || '') || 50;
  });
  const [civitaiApiKey, setCivitaiApiKey] = useState(() => {
    return localStorage.getItem('opendraw.civitaiApiKey') || '';
  });
  const [canvasgen2, setCanvasgen2] = useFeatureFlag('canvasgen2', false);
  const [drawThingsApiKey, setDrawThingsApiKey] = useState(() => {
    return localStorage.getItem('opendraw.drawthingsApiKey') || '';
  });
  const [dtAuthStatus, setDtAuthStatus] = useState<DrawThingsAuthStatus | null>(null);
  const [dtAuthLoading, setDtAuthLoading] = useState(false);
  const [dtAuthError, setDtAuthError] = useState('');
  const [pendingClean, setPendingClean] = useState<PendingClean>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const [pendingLogout, setPendingLogout] = useState(false);

  useEffect(() => {
    localStorage.setItem('opendraw.civitaiApiKey', civitaiApiKey);
  }, [civitaiApiKey]);
  useEffect(() => {
    localStorage.setItem('opendraw.drawthingsApiKey', drawThingsApiKey);
  }, [drawThingsApiKey]);

  useEffect(() => {
    getDrawThingsAuthStatus().then(setDtAuthStatus).catch(() => setDtAuthStatus(null));
  }, []);

  useEffect(() => {
    if (!drawThingsApiKey.trim()) return;
    const timer = setTimeout(async () => {
      setDtAuthLoading(true);
      setDtAuthError('');
      try {
        const status = await configureDrawThingsAuth(drawThingsApiKey.trim());
        setDtAuthStatus(status);
      } catch (err: any) {
        setDtAuthError(err.message || 'Chyba při připojování');
        setDtAuthStatus(null);
      }
      setDtAuthLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [drawThingsApiKey]);

  const fetchStats = () => {
    getGalleryStats().then(setStats).catch(() => setStats(null));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleConfirmClean = async () => {
    if (!pendingClean) return;
    setCleaning(true);
    setCleanError(null);
    try {
      await cleanGallery(pendingClean);
      fetchStats();
      setPendingClean(null);
    } catch {
      setCleanError('Nepodařilo se vymazat data, zkus to znovu.');
    }
    setCleaning(false);
  };

  const handleLogout = async () => {
    try {
      await logoutDrawThingsAuth();
      setDtAuthStatus(null);
      setDrawThingsApiKey('');
      setPendingLogout(false);
    } catch {}
  };

  const limitBytes = storageLimitGb * 1024 ** 3;
  const usagePercent = stats ? Math.min(100, (stats.totalSize / limitBytes) * 100) : 0;

  const cleanLabels: Record<Exclude<PendingClean, null>, string> = {
    all: 'VŠECHNA data (obrázky + metadata)',
    images: 'obrázky',
    metadata: 'metadata',
  };

  return (
    <div data-el-name="SettingsPageRoot" className="min-h-full w-full">
      <div data-el-name="SettingsContainer" className="max-w-2xl mx-auto px-4 lg:px-8 py-4 lg:py-10 space-y-6">
        <header data-el-name="SettingsHeader">
          <h1 data-el-name="SettingsTitle" className="text-[17px] lg:text-2xl font-semibold text-txt-primary tracking-tight">Nastavení</h1>
          <p data-el-name="SettingsSubtitle" className="text-[13px] lg:text-sm text-txt-secondary mt-1">Přizpůsob si aplikaci</p>
        </header>

        <section data-el-name="SettingsSection_Pripojeni" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">Připojení</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border space-y-3">
            <div data-el-name="DrawThingsCloudRow">
              <label className="text-[13px] text-txt-secondary block mb-1.5">Draw Things Cloud</label>
              {dtAuthStatus?.configured && !dtAuthError ? (
                <div className="flex items-center gap-2 min-h-[44px]">
                  <span className="flex items-center gap-1.5 text-[13px] text-green-600 dark:text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Připojeno
                  </span>
                  {dtAuthStatus.expiresIn != null && (
                    <span className="text-[13px] text-txt-tertiary">
                      (token vyprší za {Math.max(0, dtAuthStatus.expiresIn)}s)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingLogout(true)}
                    className="ml-auto min-h-[44px] px-3 rounded-full bg-surface border border-border text-[13px] text-txt-secondary active:bg-surface-el transition-colors"
                  >
                    Odhlásit se
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="password"
                    value={drawThingsApiKey}
                    onChange={(e) => setDrawThingsApiKey(e.target.value)}
                    placeholder="Zadej API klíč (dk_...)"
                    className="w-full bg-surface rounded-xl p-2.5 min-h-[44px] text-sm border border-border text-txt-primary outline-none focus:border-txt-secondary transition-colors placeholder:text-txt-tertiary"
                  />
                  {dtAuthLoading && (
                    <p className="text-[13px] text-txt-tertiary">Ověřuji...</p>
                  )}
                  {dtAuthError && (
                    <p className="text-[13px] text-red-500">{dtAuthError}</p>
                  )}
                  <p className="text-[13px] text-txt-tertiary">
                    API klíč pro Draw Things Cloud. Lze získat v nastavení Draw Things aplikace.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section data-el-name="SettingsSection_Vzhled" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">Vzhled</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border space-y-3">
            <ToggleRow
              label="Tmavý režim"
              value={theme === 'dark'}
              onChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
            <ChoiceRow<'dark' | 'light'>
              label="Motiv"
              value={theme}
              options={[
                { value: 'dark', label: 'Tmavý' },
                { value: 'light', label: 'Světlý' },
              ]}
              onChange={(v) => setTheme(v)}
              cols={2}
            />
          </div>
        </section>

        <section data-el-name="SettingsSection_LoRA" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">LoRA</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border space-y-3">
            <div data-el-name="CivitaiApiKeyRow">
              <label className="text-[13px] text-txt-secondary block mb-1.5">CivitAI API klíč</label>
              <input
                type="password"
                value={civitaiApiKey}
                onChange={(e) => setCivitaiApiKey(e.target.value)}
                placeholder="Zadej API klíč..."
                className="w-full bg-surface rounded-xl p-2.5 min-h-[44px] text-sm border border-border text-txt-primary outline-none focus:border-txt-secondary transition-colors placeholder:text-txt-tertiary"
              />
              <p className="text-[13px] text-txt-tertiary mt-1.5">
                Používá se pro vyhledávání LoRA v CivitAI. Lze získat na{' '}
                <a href="https://civitai.com/user/account" target="_blank" rel="noopener noreferrer"
                  className="text-txt-secondary underline hover:text-txt-primary">civitai.com/user/account</a>.
              </p>
            </div>
          </div>
        </section>

        <section data-el-name="SettingsSection_Galerie" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">Galerie</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border space-y-3">
            {stats ? (
              <>
                <div data-el-name="StorageProgressBar">
                  <div className="flex justify-between text-[13px] text-txt-secondary mb-1.5">
                    <span>Využití: {formatBytes(stats.totalSize)}</span>
                    <span>{usagePercent.toFixed(1)}% z {storageLimitGb} GB</span>
                  </div>
                  <div className="h-2.5 bg-border rounded-full overflow-hidden">
                    <div
                      data-el-name="StorageProgressFill"
                      className={`h-full rounded-full transition-all duration-500 ${usagePercent > 90 ? 'bg-red-500' : 'bg-txt-primary'}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div data-el-name="StorageStatImages" className="bg-surface-el rounded-xl p-2.5">
                    <span className="text-txt-tertiary">Obrázky</span>
                    <div className="text-txt-primary font-medium mt-0.5">{stats.imageCount} ({formatBytes(stats.imagesSize)})</div>
                  </div>
                  <div data-el-name="StorageStatMetadata" className="bg-surface-el rounded-xl p-2.5">
                    <span className="text-txt-tertiary">Metadata</span>
                    <div className="text-txt-primary font-medium mt-0.5">{stats.metadataCount} ({formatBytes(stats.metadataSize)})</div>
                  </div>
                </div>

                <div data-el-name="StorageLimitRow" className="flex items-center gap-2 pt-1">
                  <label className="text-[13px] text-txt-secondary">Max. limit:</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={storageLimitGb}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(999, +e.target.value || 1));
                      setStorageLimitGb(v);
                      localStorage.setItem('opendraw.maxStorageGb', String(v));
                    }}
                    className="w-20 bg-surface rounded-xl p-1.5 min-h-[44px] text-sm border border-border text-center text-txt-primary outline-none focus:border-txt-secondary transition-colors"
                  />
                  <span className="text-[13px] text-txt-tertiary">GB</span>
                </div>

                <div data-el-name="StorageCleanButtons" className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => { setCleanError(null); setPendingClean('images'); }}
                    className="min-h-[44px] px-3 rounded-full bg-surface border border-border text-[13px] text-txt-secondary active:bg-surface-el transition-colors"
                  >
                    Vymazat obrázky
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCleanError(null); setPendingClean('metadata'); }}
                    className="min-h-[44px] px-3 rounded-full bg-surface border border-border text-[13px] text-txt-secondary active:bg-surface-el transition-colors"
                  >
                    Vymazat metadata
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCleanError(null); setPendingClean('all'); }}
                    className="min-h-[44px] px-3 rounded-full bg-red-500/10 border border-red-500/30 text-[13px] text-red-500 active:bg-red-500/20 transition-colors"
                  >
                    Vymazat vše
                  </button>
                </div>
              </>
            ) : (
              <p data-el-name="StorageLoading" className="text-[13px] text-txt-tertiary">Načítám statistiky úložiště...</p>
            )}
          </div>
        </section>

        <section data-el-name="SettingsSection_Experimental" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">Experimentální</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border space-y-3">
            <ToggleRow
              label="CanvasGen 2.0"
              value={canvasgen2}
              onChange={setCanvasgen2}
            />
          </div>
        </section>

        <section data-el-name="SettingsSection_OAplikaci" className="space-y-3">
          <h2 data-el-name="SettingsSectionTitle" className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium">O aplikaci</h2>
          <div data-el-name="SettingsCard" className="bg-surface rounded-card p-4 border border-border">
            <p data-el-name="SettingsAboutText" className="text-[13px] text-txt-secondary">OpenDraw · {new Date().getFullYear()}</p>
          </div>
        </section>
      </div>

      {pendingClean && (
        <ConfirmSheet
          title="Vymazat data?"
          message={`Opravdu chceš vymazat ${cleanLabels[pendingClean]}? Tato akce je nevratná.`}
          confirmLabel="Vymazat"
          busy={cleaning}
          error={cleanError}
          onConfirm={handleConfirmClean}
          onClose={() => { if (!cleaning) { setPendingClean(null); setCleanError(null); } }}
        />
      )}

      {pendingLogout && (
        <ConfirmSheet
          title="Odhlásit Draw Things Cloud?"
          message="Budeš muset znovu zadat API klíč pro připojení ke cloudu."
          confirmLabel="Odhlásit se"
          busy={false}
          error={null}
          onConfirm={handleLogout}
          onClose={() => setPendingLogout(false)}
        />
      )}
    </div>
  );
}
