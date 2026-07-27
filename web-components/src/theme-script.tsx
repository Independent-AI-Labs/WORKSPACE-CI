interface ThemeScriptProps {
  storageKey?: string
  defaultTheme?: 'dark' | 'light'
}

export function ThemeScript({
  storageKey = 'wc-theme',
  defaultTheme = 'dark',
}: ThemeScriptProps) {
  const js = `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)});if(t!=='light'&&t!=='dark'){t=${JSON.stringify(defaultTheme)};}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(defaultTheme)});}})();`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
