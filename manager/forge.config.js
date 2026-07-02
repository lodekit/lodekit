module.exports = {
  // No native modules to rebuild: skip @electron/rebuild's dependency walk,
  // which cannot traverse pnpm's symlinked node_modules layout.
  rebuildConfig: { onlyModules: [] },
  packagerConfig: {
    name: "Lodekit",
    appBundleId: "com.lodekit.manager",
    // Menubar-only: no Dock icon, no app switcher entry (spec §6).
    extendInfo: { LSUIElement: true },
    // Bundle inputs from scripts/prepare-bundle.mjs → Resources/node, Resources/platform.
    extraResource: ["./build/node", "./build/platform"],
    // Ad-hoc signature for the assisted alpha (spec §9). Developer ID is the
    // dormant toggle: replace "-" with the certificate name when it exists.
    osxSign: { identity: "-" },
    // Zero prod dependencies: skip the packager's prune walk (flora-colossus
    // can't traverse pnpm's symlinked layout) and exclude node_modules outright —
    // the app dir ships only package.json + src/; the platform is extraResource.
    prune: false,
    // Bundle inputs ship via extraResource; never as app source.
    ignore: [/^\/(build|scripts|tests|\.node-cache|node_modules)($|\/)/],
  },
  makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin"] }],
};
