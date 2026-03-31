/**
 * About Modal Component
 * Displays application information, version, and links
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store';
import { Dialog } from '@/shared/components/ui';
import { translations } from '@/shared/i18n';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const APP_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
  ? __APP_VERSION__
  : 'dev';

function GitHubMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.649.5.5 5.649.5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.556 0-.274-.01-1-.015-1.962-3.198.695-3.873-1.54-3.873-1.54-.523-1.328-1.277-1.682-1.277-1.682-1.044-.713.08-.699.08-.699 1.154.081 1.761 1.185 1.761 1.185 1.025 1.756 2.69 1.249 3.344.955.103-.743.401-1.249.73-1.536-2.553-.29-5.238-1.277-5.238-5.684 0-1.256.449-2.283 1.184-3.088-.119-.29-.513-1.458.113-3.041 0 0 .965-.309 3.162 1.18A10.987 10.987 0 0 1 12 6.07c.977.005 1.962.132 2.882.388 2.194-1.489 3.157-1.18 3.157-1.18.628 1.583.234 2.751.116 3.041.738.805 1.183 1.832 1.183 3.088 0 4.418-2.69 5.39-5.252 5.674.413.356.781 1.058.781 2.134 0 1.54-.014 2.782-.014 3.161 0 .308.207.668.79.555A11.502 11.502 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
    </svg>
  );
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const lang = useUIStore((state) => state.lang);
  const t = translations[lang];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="URDF Studio"
      width="w-[400px]"
      footer={
        <div className="text-center">
          <p className="text-xs text-text-tertiary">
            {t.aboutCopyright}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            {t.aboutOpenSource}
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logos/logo.png" alt="URDF Studio" className="w-12 h-12 object-contain" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">URDF Studio</h2>
            <p className="text-xs text-text-tertiary font-mono">v{APP_VERSION}</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">
          {t.aboutDescription}
        </p>

        {/* Links */}
        <div className="space-y-2">
          <a
            href="https://github.com/OpenLegged/URDF-Studio"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-border-black hover:bg-element-bg dark:hover:bg-element-hover transition-colors group"
          >
            <div className="w-9 h-9 bg-text-primary dark:bg-element-active rounded-lg flex items-center justify-center">
              <GitHubMark className="w-5 h-5 text-panel-bg dark:text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary group-hover:text-system-blue transition-colors">GitHub</div>
              <div className="text-xs text-text-tertiary">OpenLegged/URDF-Studio</div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-system-blue group-hover:translate-x-0.5 transition-all" />
          </a>

          <a
            href="https://www.motphys.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-border-black hover:bg-element-bg dark:hover:bg-element-hover transition-colors group"
          >
            <div className="w-9 h-9 bg-panel-bg dark:bg-element-active rounded-lg flex items-center justify-center overflow-hidden border border-border-black">
              <img
                src="/logos/Motphys_Logo_only_Black_100x100px.svg"
                alt="Motphys"
                className="w-full h-full object-contain p-1 dark:hidden"
              />
              <img
                src="/logos/Motphys_Logo_only_White_100x100px.svg"
                alt="Motphys"
                className="w-full h-full object-contain p-1 hidden dark:block"
              />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary group-hover:text-system-blue transition-colors">
                Motphys
              </div>
              <div className="text-xs text-text-tertiary">
                {t.aboutMotphysTagline}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-system-blue group-hover:translate-x-0.5 transition-all" />
          </a>

          <a
            href="https://www.d-robotics.cc/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-border-black hover:bg-element-bg dark:hover:bg-element-hover transition-colors group"
          >
            <div className="w-9 h-9 bg-panel-bg dark:bg-element-active rounded-lg flex items-center justify-center overflow-hidden border border-border-black">
              <img src="/logos/d-robotics-logo.jpg" alt="D-Robotics" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary group-hover:text-orange-500 transition-colors">
                {t.aboutDRoboticsName}
              </div>
              <div className="text-xs text-text-tertiary">
                {t.aboutDRoboticsTagline}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
          </a>
        </div>
      </div>
    </Dialog>
  );
}

export default AboutModal;
