/** @type {import("next").NextConfig} */
const withTM = require("next-transpile-modules")(["juava", "@jitsu/protocols", "@jitsu/core-functions"]);
const nextConfig = withTM({});
const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = nextConfig;

const prevWebpack = module.exports.webpack;

const packageRoot = path.join(__dirname, "../../");
console.log("packageRoot", packageRoot);
module.exports = {
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "./**/node_modules/@swc/core-linux-x64-gnu",
        "./**/node_modules/@swc/core-linux-x64-musl",
        "./**/node_modules/esbuild/linux",
        "./**/node_modules/webpack",
        "./**/node_modules/rollup",
        "./**/node_modules/terser",
      ],
    },
  },
  outputFileTracing: true,
  webpack: (config, opts) => {
    if (prevWebpack) {
      prevWebpack(config, opts);
    }
    // Fixes npm packages that depend on `fs` and 'dns' module
    if (!opts.isServer) {
      config.resolve.fallback = {
        util: false,
        fs: false,
        process: false,
        buffer: false,
        assert: false,
      };
      config.plugins.push(new opts.webpack.IgnorePlugin({ resourceRegExp: /^mongodb$/ }));
      config.plugins.push(new opts.webpack.IgnorePlugin({ resourceRegExp: /^posthog-node$/ }));
    }
    config.externals.vm2 = "require('vm2')";
    config.module.rules.push({
      test: /\.txt$/,
      use: "raw-loader",
    });
    config.module.rules.push({
      test: /\.node$/,
      loader: "node-loader",
    });
    config.resolve.extensions.push(".node");
    return config;
  },
};

// Injected content via Sentry wizard below

module.exports = withSentryConfig(
  module.exports,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    dryRun: !process.env.SENTRY_AUTH_TOKEN,
    // Suppresses source map uploading logs during build
    silent: true,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: "jitsucom",
    project: "new-jitsu",
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  }
);
