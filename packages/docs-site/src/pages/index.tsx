import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Translate, {translate} from '@docusaurus/Translate';

import styles from './index.module.css';

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

const featureIcons: ReactNode[] = [
  (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  ),
  (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 7h3a2 2 0 0 1 2 2v3" />
      <path d="M10 17H7a2 2 0 0 1-2-2v-3" />
      <rect x="8" y="8" width="8" height="8" rx="2" />
    </svg>
  ),
  (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  ),
  (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
];

const features: Feature[] = [
  {
    title: translate({id: 'home.features.stack.title', message: '任意技术栈'}),
    description: translate({
      id: 'home.features.stack.description',
      message:
        '原生 JS、Vue，或你熟悉的任何前端框架——组件最终打包为独立产物，运行在技术栈无关的沙箱环境中。',
    }),
    icon: featureIcons[0],
  },
  {
    title: translate({id: 'home.features.sdk.title', message: 'Widget SDK'}),
    description: translate({
      id: 'home.features.sdk.description',
      message:
        '通过 @patab/widget-sdk 与宿主通信：读写本地存储、响应主题与语言变化，几行代码即可接入。',
    }),
    icon: featureIcons[1],
  },
  {
    title: translate({id: 'home.features.hmr.title', message: '热更新调试'}),
    description: translate({
      id: 'home.features.hmr.description',
      message:
        '@patab/widget-cli 内置开发服务器，保存即刷新。把调试地址填入 PaTab，实时预览每一次改动。',
    }),
    icon: featureIcons[2],
  },
  {
    title: translate({id: 'home.features.distribute.title', message: '一键分发'}),
    description: translate({
      id: 'home.features.distribute.description',
      message:
        '打包为单个 .patab.zip 文件，直接分享给其他 PaTab 用户安装——无需上架商店，无需审核。',
    }),
    icon: featureIcons[3],
  },
];

const terminalLines: {prompt?: string; command?: string; comment?: string; output?: string}[] = [
  {
    comment: translate({id: 'home.terminal.comment.create', message: '# 一键创建组件项目'}),
  },
  {prompt: '$', command: 'pnpm create patab-widget my-widget'},
  {
    comment: translate({id: 'home.terminal.comment.dev', message: '# 进入项目并启动开发服务器'}),
  },
  {prompt: '$', command: 'cd my-widget && pnpm install'},
  {prompt: '$', command: 'pnpm dev'},
  {
    output: translate({
      id: 'home.terminal.output.devHost',
      message: '  ➜ PaTab 开发宿主: http://127.0.0.1:5174/__patab_dev__/',
    }),
  },
  {
    output: translate({
      id: 'home.terminal.output.loaded',
      message: '  ➜ 沙箱已加载，改动即时生效…',
    }),
  },
  {
    comment: translate({id: 'home.terminal.comment.pack', message: '# 打包为可分发文件'}),
  },
  {prompt: '$', command: 'pnpm run pack'},
  {
    output: translate({
      id: 'home.terminal.output.packed',
      message: '  ✓ 打包完成: dist/my-widget-0.1.0.patab.zip',
    }),
  },
];

function HeroSection() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroGlowA} aria-hidden="true" />
      <div className={styles.heroGlowB} aria-hidden="true" />
      <div className={clsx('container', styles.heroInner)}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>
            <Translate id="home.hero.badge">Widget 插件开发文档</Translate>
          </span>
          <Heading as="h1" className={styles.heroTitle}>
            <Translate id="home.hero.title.line1">为 PaTab 新标签页</Translate>
            <br />
            <span className={styles.heroTitleGradient}>
              <Translate id="home.hero.title.line2">打造你自己的组件</Translate>
            </span>
          </Heading>
          <p className={styles.heroSubtitle}>
            <Translate id="home.hero.subtitle.line1">
              用任意前端技术栈编写小组件，放进本地优先的浏览器工作台。
            </Translate>
            <br />
            <Translate id="home.hero.subtitle.line2">
              开发、调试、打包、分发——一条命令链搞定。
            </Translate>
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button button--lg', styles.ctaPrimary)}
              to="/docs/getting-started">
              <Translate id="home.hero.cta.primary">快速开始 · 5 分钟</Translate>
            </Link>
            <Link
              className={clsx('button button--lg', styles.ctaSecondary)}
              to="/docs/">
              <Translate id="home.hero.cta.secondary">了解组件平台</Translate>
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
          <Translate id="home.features.title">为开发者准备的工具链</Translate>
        </Heading>
        <p className={styles.sectionSubtitle}>
          <Translate id="home.features.subtitle">
            从脚手架到分发文件，每个环节都有现成的工具。
          </Translate>
        </p>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureCard}>
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
          <Translate id="home.terminal.title">四条命令，从 0 到可分发</Translate>
        </Heading>
        <p className={styles.sectionSubtitle}>
          <Translate id="home.terminal.subtitle">
            没有繁琐配置，脚手架已经为你准备好一切。
          </Translate>
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
            <Translate id="home.terminal.cta">查看完整快速开始指南</Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title={translate({id: 'home.layout.title', message: '首页'})}
      description={translate({
        id: 'home.layout.description',
        message:
          'PaTab 自定义组件（Widget）插件开发文档：用任意技术栈为新标签页开发组件',
      })}>
      <HeroSection />
      <main>
        <FeaturesSection />
        <TerminalSection />
      </main>
    </Layout>
  );
}
