export const metadata = {
  title: 'EasyPOS',
  description: 'Une caisse gratuite pour organiser les ventes et le stock de votre magasin.',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/easypos-logo.png` },
};

export default function RootLayout({ children }) {
  return <html lang="fr"><body>{children}</body></html>;
}
