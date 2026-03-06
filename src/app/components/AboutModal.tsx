/**
 * About Modal Component
 * Displays application information, version, and links
 */
import React from 'react';
import { ArrowRight, Github } from 'lucide-react';
import { useUIStore } from '@/store';
import { Dialog } from '@/shared/components/ui';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const lang = useUIStore((state) => state.lang);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="URDF Studio"
      width="w-[400px]"
      footer={
        <div className="text-center">
          <p className="text-xs text-text-tertiary">
            {lang === 'zh' ? '© 2025-2026 OpenLegged.' : '© 2025-2026 OpenLegged.'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            {lang === 'zh' ? '基于 Apache License 2.0 协议开源。' : 'Open sourced under Apache License 2.0.'}
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logos/logo.png" alt="URDF Studio" className="w-12 h-12 object-contain" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">URDF Studio</h2>
            <p className="text-xs text-text-tertiary font-mono">v1.0.0</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">
          {lang === 'zh'
            ? '专业的机器人 URDF 设计与可视化工作站，支持快速编辑，碰撞优化，参数配置，AI审阅和实用工具。'
            : 'Professional robot URDF design and visualization workstation, supporting fast editing, collision optimization, parameter configuration, AI review and utility tools.'}
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
              <Github className="w-5 h-5 text-panel-bg dark:text-white" />
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
                {lang === 'zh' ? '超越物理，进化不止' : 'Evolution Beyond Physics'}
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
                {lang === 'zh' ? '地瓜机器人' : 'D-Robotics'}
              </div>
              <div className="text-xs text-text-tertiary">
                {lang === 'zh' ? '感谢支持' : 'Thanks for support'}
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
