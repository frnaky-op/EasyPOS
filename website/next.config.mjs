const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
