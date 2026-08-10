import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import type {CSSProperties, ReactNode} from 'react';
import styles from './styles.module.css';

type ThemeName = 'light' | 'dark';

/*
 * 演示用 token 取值与 patab-web/src/custom-components/runtime/widgetTheme.ts
 * 的 createFallbackTokens 保持一致（键集合即 WidgetThemeTokenName 的 20 个契约 token），
 * 完整性由 scripts/verify-theme-css-showcase.mjs 校验。
 */
const TOKEN_VALUES: Record<ThemeName, Record<string, string>> = {
  light: {
    '--pt-surface': 'rgb(255 255 255 / 0.45)',
    '--pt-surface-strong': 'rgb(255 255 255 / 0.8)',
    '--pt-text': 'rgb(64 64 64)',
    '--pt-text-strong': 'rgb(38 38 38)',
    '--pt-text-muted': 'rgb(115 115 115)',
    '--pt-accent': 'rgb(2 132 199)',
    '--pt-accent-contrast': 'rgb(255 255 255)',
    '--pt-accent-hover': 'rgb(3 105 161)',
    '--pt-border': 'rgb(255 255 255 / 0.45)',
    '--pt-input': 'rgb(255 255 255 / 0.7)',
    '--pt-danger': 'rgb(220 38 38)',
    '--pt-focus-ring': 'rgb(2 132 199)',
    '--pt-radius-sm': '0.75rem',
    '--pt-radius-md': '1rem',
    '--pt-radius-lg': '1.5rem',
    '--pt-shadow': '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    '--pt-font-sans': 'Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif',
    '--pt-motion-duration': '150ms',
    '--pt-motion-easing': 'ease',
    '--pt-color-scheme': 'light',
  },
  dark: {
    '--pt-surface': 'rgb(255 255 255 / 0.08)',
    '--pt-surface-strong': 'rgb(24 24 27 / 0.88)',
    '--pt-text': 'rgb(229 229 229)',
    '--pt-text-strong': 'rgb(245 245 245)',
    '--pt-text-muted': 'rgb(161 161 170)',
    '--pt-accent': 'rgb(56 189 248)',
    '--pt-accent-contrast': 'rgb(8 47 73)',
    '--pt-accent-hover': 'rgb(125 211 252)',
    '--pt-border': 'rgb(255 255 255 / 0.14)',
    '--pt-input': 'rgb(255 255 255 / 0.14)',
    '--pt-danger': 'rgb(252 165 165)',
    '--pt-focus-ring': 'rgb(125 211 252)',
    '--pt-radius-sm': '0.75rem',
    '--pt-radius-md': '1rem',
    '--pt-radius-lg': '1.5rem',
    '--pt-shadow': '0 10px 15px -3px rgb(0 0 0 / 0.32)',
    '--pt-font-sans': 'Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif',
    '--pt-motion-duration': '150ms',
    '--pt-motion-easing': 'ease',
    '--pt-color-scheme': 'dark',
  },
};

/** 取值可按背景色直接预览的 token；其余 token 用专用预览或仅展示取值。 */
const COLOR_TOKENS = new Set([
  '--pt-surface',
  '--pt-surface-strong',
  '--pt-text',
  '--pt-text-strong',
  '--pt-text-muted',
  '--pt-accent',
  '--pt-accent-contrast',
  '--pt-accent-hover',
  '--pt-border',
  '--pt-input',
  '--pt-danger',
  '--pt-focus-ring',
]);

const RADIUS_TOKENS = new Set(['--pt-radius-sm', '--pt-radius-md', '--pt-radius-lg']);

const I18N = {
  zh: {
    light: '亮色主题',
    dark: '暗色主题',
    galleryHeading: '语义类',
    tokensHeading: '主题 token 取值',
    token: 'Token',
    purpose: '用途',
    lightValue: '亮色取值',
    darkValue: '暗色取值',
    preview: '预览',
    surfaceBody: '正文 .pt-text',
    surfaceMuted: '弱化文字 .pt-text-muted',
    textStrong: '标题文字 .pt-text-strong',
    textBody: '正文文字 .pt-text',
    textMuted: '次要说明文字 .pt-text-muted',
    button: '主要按钮',
    inputPlaceholder: '输入内容…',
    focusHint: '点击我，或用 Tab 聚焦查看焦点环',
    danger: '危险操作文字',
    fontPreview: '字体示例 Aa 中文字体',
    purposes: {
      '--pt-surface': '常规表面背景',
      '--pt-surface-strong': '强调表面背景',
      '--pt-text': '正文文字',
      '--pt-text-strong': '强调文字',
      '--pt-text-muted': '弱化文字',
      '--pt-accent': '主题强调色',
      '--pt-accent-contrast': '强调色上的对比文字色',
      '--pt-accent-hover': '强调色 hover 态',
      '--pt-border': '边框',
      '--pt-input': '输入控件背景',
      '--pt-danger': '危险色',
      '--pt-focus-ring': '焦点环',
      '--pt-radius-sm': '圆角（小）',
      '--pt-radius-md': '圆角（中）',
      '--pt-radius-lg': '圆角（大）',
      '--pt-shadow': '阴影',
      '--pt-font-sans': '正文字体族',
      '--pt-motion-duration': '动效时长',
      '--pt-motion-easing': '动效缓动',
      '--pt-color-scheme': 'color-scheme 值',
    } as Record<string, string>,
  },
  en: {
    light: 'Light theme',
    dark: 'Dark theme',
    galleryHeading: 'Semantic classes',
    tokensHeading: 'Theme token values',
    token: 'Token',
    purpose: 'Purpose',
    lightValue: 'Light value',
    darkValue: 'Dark value',
    preview: 'Preview',
    surfaceBody: 'Body .pt-text',
    surfaceMuted: 'Muted text .pt-text-muted',
    textStrong: 'Heading text .pt-text-strong',
    textBody: 'Body text .pt-text',
    textMuted: 'Secondary text .pt-text-muted',
    button: 'Primary button',
    inputPlaceholder: 'Type something…',
    focusHint: 'Click me, or press Tab to see the focus ring',
    danger: 'Destructive action text',
    fontPreview: 'Font sample Aa 中文字体',
    purposes: {
      '--pt-surface': 'Regular surface background',
      '--pt-surface-strong': 'Emphasized surface background',
      '--pt-text': 'Body text',
      '--pt-text-strong': 'Emphasized text',
      '--pt-text-muted': 'De-emphasized text',
      '--pt-accent': 'Theme accent color',
      '--pt-accent-contrast': 'Contrasting text on the accent color',
      '--pt-accent-hover': 'Accent color hover state',
      '--pt-border': 'Border',
      '--pt-input': 'Input control background',
      '--pt-danger': 'Danger color',
      '--pt-focus-ring': 'Focus ring',
      '--pt-radius-sm': 'Border radius (small)',
      '--pt-radius-md': 'Border radius (medium)',
      '--pt-radius-lg': 'Border radius (large)',
      '--pt-shadow': 'Shadow',
      '--pt-font-sans': 'Body font family',
      '--pt-motion-duration': 'Motion duration',
      '--pt-motion-easing': 'Motion easing',
      '--pt-color-scheme': 'color-scheme value',
    } as Record<string, string>,
  },
};

type Labels = (typeof I18N)['zh'];

function tokensToStyle(theme: ThemeName): CSSProperties {
  return TOKEN_VALUES[theme] as CSSProperties;
}

/*
 * 演示面板的页面底色（仅展示用，不属于主题契约）：
 * 模拟宿主画布，暗色主题下白灰色文字必须衬在深色底上才符合真实运行效果。
 */
const PAGE_BACKDROP: Record<ThemeName, string> = {
  light: '#eef2f7',
  dark: '#101013',
};

function DemoPanel({theme, labels, children}: {theme: ThemeName; labels: Labels; children: ReactNode}) {
  return (
    <div>
      <span className={styles.panelLabel}>{theme === 'light' ? labels.light : labels.dark}</span>
      <div
        className={styles.demo}
        style={{...tokensToStyle(theme), background: PAGE_BACKDROP[theme]}}>
        {children}
      </div>
    </div>
  );
}

function Gallery({labels}: {labels: Labels}) {
  const content = (
    <>
      <code className={styles.className}>.pt-surface</code>
      <div className={`pt-surface ${styles.demoBox}`}>
        <p className="pt-text">{labels.surfaceBody}</p>
        <p className="pt-text-muted">{labels.surfaceMuted}</p>
      </div>
      <code className={styles.className}>.pt-surface-strong</code>
      <div className={`pt-surface-strong ${styles.demoBox}`}>
        <p className="pt-text-strong">{labels.textStrong}</p>
      </div>
      <code className={styles.className}>.pt-text / .pt-text-strong / .pt-text-muted</code>
      <div className={styles.demoText}>
        <p className="pt-text-strong">{labels.textStrong}</p>
        <p className="pt-text">{labels.textBody}</p>
        <p className="pt-text-muted">{labels.textMuted}</p>
      </div>
      <code className={styles.className}>.pt-button（hover / active / focus-visible）</code>
      <button type="button" className={`pt-button ${styles.demoButton}`}>
        {labels.button}
      </button>
      <code className={styles.className}>.pt-input</code>
      <input className={`pt-input ${styles.demoInput}`} placeholder={labels.inputPlaceholder} />
      <code className={styles.className}>.pt-focus-ring</code>
      <span tabIndex={0} className={`pt-focus-ring ${styles.demoFocus}`}>
        {labels.focusHint}
      </span>
      <code className={styles.className}>.pt-danger</code>
      <span className="pt-danger">{labels.danger}</span>
    </>
  );
  return (
    <div className={styles.panelGrid}>
      <DemoPanel theme="light" labels={labels}>
        {content}
      </DemoPanel>
      <DemoPanel theme="dark" labels={labels}>
        {content}
      </DemoPanel>
    </div>
  );
}

function TokenPreview({token, labels}: {token: string; labels: Labels}) {
  const light = TOKEN_VALUES.light[token];
  const dark = TOKEN_VALUES.dark[token];
  if (COLOR_TOKENS.has(token)) {
    return (
      <>
        <span className={styles.swatch} style={{background: light}} title={light} />{' '}
        <span className={styles.swatch} style={{background: dark}} title={dark} />
      </>
    );
  }
  if (RADIUS_TOKENS.has(token)) {
    return <span className={styles.radiusPreview} style={{borderRadius: light}} />;
  }
  if (token === '--pt-shadow') {
    return <span className={styles.shadowPreview} style={{boxShadow: light}} />;
  }
  if (token === '--pt-font-sans') {
    return <span style={{fontFamily: light}}>{labels.fontPreview}</span>;
  }
  return <span>—</span>;
}

function TokenTable({labels}: {labels: Labels}) {
  return (
    <table>
      <thead>
        <tr>
          <th>{labels.token}</th>
          <th>{labels.purpose}</th>
          <th>{labels.preview}</th>
          <th>{labels.lightValue}</th>
          <th>{labels.darkValue}</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(TOKEN_VALUES.light).map((token) => (
          <tr key={token}>
            <td>
              <code>{token}</code>
            </td>
            <td>{labels.purposes[token]}</td>
            <td>
              <TokenPreview token={token} labels={labels} />
            </td>
            <td className={styles.valueCell}>
              <code>{TOKEN_VALUES.light[token]}</code>
            </td>
            <td className={styles.valueCell}>
              <code>{TOKEN_VALUES.dark[token]}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ThemeCssShowcase() {
  const {i18n} = useDocusaurusContext();
  const labels = i18n.currentLocale === 'en' ? I18N.en : I18N.zh;
  return (
    <div>
      <h3>{labels.galleryHeading}</h3>
      <Gallery labels={labels} />
      <h3>{labels.tokensHeading}</h3>
      <TokenTable labels={labels} />
    </div>
  );
}
