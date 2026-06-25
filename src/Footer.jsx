// Crédito de autoría, mostrado al pie de la web.
export default function Footer() {
  return (
    <footer className="mt-auto w-full pt-10 pb-4 text-center">
      <p className="text-sm text-white/70">
        Diseñado por{' '}
        <a
          href="https://rameseba.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-white underline-offset-2 transition hover:text-white hover:underline"
        >
          @rameseba
        </a>
      </p>
    </footer>
  )
}
