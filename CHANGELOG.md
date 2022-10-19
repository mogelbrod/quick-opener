## [0.2.0](https://github.com/mogelbrod/quick-opener/compare/v0.1.0...v0.2.0) (2022-10-19)


### Features

* Allow fallback starting directory to be customized using `quickOpener.fallbackDirectory` ([e6ed2b6](https://github.com/mogelbrod/quick-opener/commit/e6ed2b63e515a5c21810ed4a68c1bfc03f6eef97))
* Show "open workspace" item button for `*.code-workspace` files ([f2db318](https://github.com/mogelbrod/quick-opener/commit/f2db31895f2aff77b30b91a941d535b233581046))


### Code Refactoring

* **QuickOpener:** Make `stat` object available in action/accept handlers ([49710c8](https://github.com/mogelbrod/quick-opener/commit/49710c815eaff136e4b29d73f0da784c1eaea1cc))

## [0.1.0](https://github.com/mogelbrod/quick-opener/compare/v0.0.1...v0.1.0) (2022-10-16)


### Features

* Improve perf by limiting number of generated suggestions using new `maxCandidates` setting ([6e63588](https://github.com/mogelbrod/quick-opener/commit/6e63588b6cb4cf95ba90a20ead6d6826b5d58ed6))
* Make "Add to workspace" trigger "Open folder" instead when workspace has no folders ([6384abf](https://github.com/mogelbrod/quick-opener/commit/6384abfbf0c37b4e82f2a6ccae933a48e9a1d5a1))


### Performance Improvements

* Don't block scanner while `stat()`ing input to determine window buttons ([20b7e49](https://github.com/mogelbrod/quick-opener/commit/20b7e49f0cecd4c929f85297f8791565bac516fe))
* Only scan and produce results for the last directory in the input ([d2b222b](https://github.com/mogelbrod/quick-opener/commit/d2b222bca9f72b5b7c8b504e6c85b8a20248eddc))


## 0.0.1 (2022-10-15)

Initial release
