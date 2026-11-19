import { getPageHtml } from './content';
import LandingMotion from './landing-motion';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata = {
  title: 'EasyPOS — Une journée plus simple pour votre commerce',
  description: 'EasyPOS simplifie la vente, les prix, le stock, les clients et les fournisseurs de votre boutique. Gratuit et open source, sur PC et téléphone, avec un simple Wi-Fi local.',
  openGraph: { image: 'https://frnaky-op.github.io/EasyPOS/images/owner-phone-store.png' },
};

export default function Home() {
  return <>
    <link rel="stylesheet" href={`${basePath}/landing.css`} />
    <div dangerouslySetInnerHTML={{ __html: getPageHtml('index.html') }} />
    <LandingMotion />
  </>;
}
