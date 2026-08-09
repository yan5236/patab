import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

const features: Feature[] = [
  {
    title: '任意技术栈',
    description:
      '原生 JS、Vue，或你熟悉的任何前端框架——组件最终打包为独立产物，运行在技术栈无关的沙箱环境中。',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 2 7l10 5 10-5-10-5Z" />
        <path d="m2 17 10 5 10-5" />
        <path d="m2 12 10 5 10-5" />
      </svg>
    ),
  },
  {
    title: 'Widget SDK',
    description:
      '通过 @patab/widget-sdk 与宿主通信：读写本地存储、响应主题与语言变化，几行代码即可接入。',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 7h3a2 2 0 0 1 2 2v3" />
        <path d="M10 17H7a2 2 0 0 1-2-2v-3" />
        <rect x="8" y="8" width="8" height="8" rx="2" />
      </svg>
    ),
  },
  {
    title: '热更新调试',
    description:
      '@patab/widget-cli 内置开发服务器，保存即刷新。把调试地址填入 PaTab，实时预览每一次改动。',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
  },
  {
    title: '一键分发',
    description:
      '打包为单个 .patab.zip 文件，直接分享给其他 PaTab 用户安装——无需上架商店，无需审核。',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
];

const terminalLines: {prompt?: string; command?: string; comment?: string; output?: string}[] = [
  {comment: '# 一键创建组件项目'},
  {prompt: '$', command: 'pnpm create patab-widget my-widget'},
  {comment: '# 进入项目并启动开发服务器'},
  {prompt: '$', command: 'cd my-widget && pnpm install'},
  {prompt: '$', command: 'pnpm dev'},
  {output: '  ➜ 模拟器: http://127.0.0.1:5174/__patab_widget_simulator__'},
  {output: '  ➜ 沙箱已加载，改动即时生效…'},
  {comment: '# 打包为可分发文件'},
  {prompt: '$', command: 'pnpm pack'},
  {output: '  ✓ 打包完成: dist/my-widget-0.1.0.patab.zip'},
];

function HeroSection() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroGlowA} aria-hidden="true" />
      <div className={styles.heroGlowB} aria-hidden="true" />
      <div className={clsx('container', styles.heroInner)}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Widget 插件开发文档</span>
          <Heading as="h1" className={styles.heroTitle}>
            为 PaTab 新标签页
            <br />
            <span className={styles.heroTitleGradient}>打造你自己的组件</span>
          </Heading>
          <p className={styles.heroSubtitle}>
            用任意前端技术栈编写小组件，放进本地优先的浏览器工作台。
            <br />
            开发、调试、打包、分发——一条命令链搞定。
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button button--lg', styles.ctaPrimary)}
              to="/docs/getting-started">
              快速开始 · 5 分钟
            </Link>
            <Link
              className={clsx('button button--lg', styles.ctaSecondary)}
              to="/docs/">
              了解组件平台
            </Link>
          </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.logoCard}>
            <img src="img/logo.jpg" alt="" className={styles.logoImg} />
          </div>
          <div className={clsx(styles.tile, styles.tileA)} />
          <div className={clsx(styles.tile, styles.tileB)} />
          <div className={clsx(styles.tile, styles.tileC)} />
        </div>
      </div>
    </header>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          为开发者准备的工具链
        </Heading>
        <p className={styles.sectionSubtitle}>
          从脚手架到分发文件，每个环节都有现成的工具。
        </p>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <Heading as="h3" className={styles.featureTitle}>
                {feature.title}
              </Heading>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TerminalSection() {
  return (
    <section className={styles.terminalSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          四条命令，从 0 到可分发
        </Heading>
        <p className={styles.sectionSubtitle}>
          没有繁琐配置，脚手架已经为你准备好一切。
        </p>
        <div className={styles.terminal}>
          <div className={styles.terminalBar}>
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalTitle}>terminal</span>
          </div>
          <div className={styles.terminalBody}>
            {terminalLines.map((line, i) => {
              if (line.comment) {
                return (
                  <div key={i} className={styles.terminalLine}>
                    <span className={styles.terminalComment}>{line.comment}</span>
                  </div>
                );
              }
              if (line.output) {
                return (
                  <div key={i} className={styles.terminalLine}>
                    <span className={styles.terminalOutput}>{line.output}</span>
                  </div>
                );
              }
              return (
                <div key={i} className={styles.terminalLine}>
                  <span className={styles.terminalPrompt}>{line.prompt}</span>
                  <span className={styles.terminalCommand}>{line.command}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.terminalCta}>
          <Link
            className={clsx('button button--lg', styles.ctaPrimary)}
            to="/docs/getting-started">
            查看完整快速开始指南
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="首页"
      description="PaTab 自定义组件（Widget）插件开发文档：用任意技术栈为新标签页开发组件">
      <HeroSection />
      <main>
        <FeaturesSection />
        <TerminalSection />
      </main>
    </Layout>
  );
}
