import { getPageHtml } from '../content';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata = {
  title: "Guide d'utilisation — EasyPOS",
  description: 'Prérequis, installation, produits, ventes, stock, catalogue mobile, codes-barres, sauvegardes et mises à jour.',
};

export default function Guide() {
  return <>
    <link rel="stylesheet" href={`${basePath}/styles.css`} />
    <link rel="stylesheet" href={`${basePath}/guide-extras.css`} />
    <div className="guide-page" dangerouslySetInnerHTML={{ __html: getPageHtml('guide.html') }} />
  </>;
}
