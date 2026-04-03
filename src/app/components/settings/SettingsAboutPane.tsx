import React from 'react';
import { ArrowRight } from 'lucide-react';

import type { TranslationKeys } from '@/shared/i18n';

const APP_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
    ? __APP_VERSION__
    : 'dev';

interface SettingsAboutPaneProps {
  t: TranslationKeys;
}

interface AboutLinkCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function GitHubMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.649.5.5 5.649.5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.556 0-.274-.01-1-.015-1.962-3.198.695-3.873-1.54-3.873-1.54-.523-1.328-1.277-1.682-1.277-1.682-1.044-.713.08-.699.08-.699 1.154.081 1.761 1.185 1.761 1.185 1.025 1.756 2.69 1.249 3.344.955.103-.743.401-1.249.73-1.536-2.553-.29-5.238-1.277-5.238-5.684 0-1.256.449-2.283 1.184-3.088-.119-.29-.513-1.458.113-3.041 0 0 .965-.309 3.162 1.18A10.987 10.987 0 0 1 12 6.07c.977.005 1.962.132 2.882.388 2.194-1.489 3.157-1.18 3.157-1.18.628 1.583.234 2.751.116 3.041.738.805 1.183 1.832 1.183 3.088 0 4.418-2.69 5.39-5.252 5.674.413.356.781 1.058.781 2.134 0 1.54-.014 2.782-.014 3.161 0 .308.207.668.79.555A11.502 11.502 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
    </svg>
  );
}

function AboutLinkCard({ href, icon, title, description }: AboutLinkCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-settings-muted"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-black bg-panel-bg text-text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-text-primary transition-colors group-hover:text-settings-accent">
          {title}
        </div>
        <div className="mt-0.5 text-[11px] leading-5 text-text-tertiary">{description}</div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-all group-hover:translate-x-0.5 group-hover:text-settings-accent" />
    </a>
  );
}

export function SettingsAboutPane({ t }: SettingsAboutPaneProps) {
  return (
    <div className="space-y-3">
      <section className="rounded-[12px] border border-border-black bg-settings-card px-4 py-6 text-center">
        <img src="/logos/logo.png" alt="URDF Studio" className="mx-auto h-14 w-14 object-contain" />
        <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
          URDF Studio
        </h3>
        <div className="mt-2 inline-flex h-7 items-center rounded-[6px] border border-border-black bg-panel-bg px-2.5 text-[11px] font-medium text-text-secondary">
          {t.version}: v{APP_VERSION}
        </div>
        <p className="mx-auto mt-3 max-w-[30rem] text-[12px] leading-6 text-text-secondary">
          {t.aboutDescription}
        </p>
      </section>

      <section className="rounded-[12px] border border-border-black bg-settings-card p-2">
        <div className="px-2 pb-2 pt-1 text-[11px] font-medium text-text-tertiary">
          {t.resources}
        </div>
        <div className="space-y-1">
          <AboutLinkCard
            href="https://github.com/OpenLegged/URDF-Studio"
            icon={<GitHubMark className="h-5 w-5" />}
            title="GitHub"
            description="OpenLegged/URDF-Studio"
          />
          <AboutLinkCard
            href="https://www.motphys.com/"
            icon={
              <>
                <img
                  src="/logos/Motphys_Logo_only_Black_100x100px.svg"
                  alt="Motphys"
                  className="h-full w-full object-contain p-1 dark:hidden"
                />
                <img
                  src="/logos/Motphys_Logo_only_White_100x100px.svg"
                  alt="Motphys"
                  className="hidden h-full w-full object-contain p-1 dark:block"
                />
              </>
            }
            title="Motphys"
            description={t.aboutMotphysTagline}
          />
          <AboutLinkCard
            href="https://www.d-robotics.cc/"
            icon={
              <img
                src="/logos/d-robotics-logo.jpg"
                alt="D-Robotics"
                className="h-full w-full rounded-[inherit] object-cover"
              />
            }
            title={t.aboutDRoboticsName}
            description={t.aboutDRoboticsTagline}
          />
        </div>
      </section>

      <section className="rounded-[12px] border border-border-black bg-settings-card px-4 py-3 text-[11px] leading-5 text-text-tertiary">
        <p>{t.aboutCopyright}</p>
        <p className="mt-1">{t.aboutOpenSource}</p>
      </section>
    </div>
  );
}

export default SettingsAboutPane;
