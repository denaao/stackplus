/**
 * Loading padrão da aplicação: logo STACK+ centralizado sobre o fundo padrão.
 * Use sempre que uma página estiver em estado de loading inicial.
 * Tamanho fixo: text-[26px] (2px acima do text-2xl anterior).
 */
export default function AppLoading() {
  return (
    <div className="min-h-screen bg-sx-bg flex items-center justify-center">
      <span className="font-black text-[26px] tracking-tight">
        <span className="text-sx-cyan">STACK</span>
        <span className="text-white">+</span>
      </span>
    </div>
  )
}
