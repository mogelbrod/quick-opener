## [0.4.1](https://github.com/mogelbrod/quick-opener/compare/v0.4.0...v0.4.1) (2022-11-07)


### Bug Fixes

* **commands:** Use title case for 'show' command title ([e7c000c](https://github.com/mogelbrod/quick-opener/commit/e7c000cc5c2d9953c5ea1c479ed6cd6845b1181e))

## [0.4.0](https://github.com/mogelbrod/quick-opener/compare/v0.3.1...v0.4.0) (2022-11-06)


### Features

* Replace input value with selected item when Tab key is pressed ([cb421a6](https://github.com/mogelbrod/quick-opener/commit/cb421a6b909884ead7c4fdf8d336ebed9be716d8))


### Code Refactoring

* Let quick pick trigger list regeneration ([5138202](https://github.com/mogelbrod/quick-opener/commit/51382025e8d0d37d20b72f40b0015fd8f0535cb2))

## [0.3.1](https://github.com/mogelbrod/quick-opener/compare/v0.3.0...v0.3.1) (2022-10-29)


### Bug Fixes

* Don't crash on windows ([d0eca3f](https://github.com/mogelbrod/quick-opener/commit/d0eca3fa24a1abe061bfb63fa99341c7bd72f4e9))

## [0.3.0](https://github.com/mogelbrod/quick-opener/compare/v0.2.1...v0.3.0) (2022-10-29)


### Features

* Add customizable keybindings for all defined actions + pop directory ([daaab6e](https://github.com/mogelbrod/quick-opener/commit/daaab6eae3f1fe1a9fe0e9d3c06e5a6276feeda4))
* Attempt to locate original dir when triggered from a `/commit~{sha}/...` file path ([864f98a](https://github.com/mogelbrod/quick-opener/commit/864f98a60b704771d4e352f501aeac62f1793d15))


### Bug Fixes

* Avoid throwing if `resolveRelative()` is called with a slash-less path ([895e58d](https://github.com/mogelbrod/quick-opener/commit/895e58d4c62c148d0a035d965ba4b19fc5495103))
* Don't use active file as starting point if it doesn't contain any slashes ([af43951](https://github.com/mogelbrod/quick-opener/commit/af43951aba7fc259310a102e47f874ba677763c4))
* Prevent `popPath` from resulting in `.` input ([c72d77e](https://github.com/mogelbrod/quick-opener/commit/c72d77e04677e9ceec5a89c4e16da2f4a83b3288))
* Trigger (item) action commands argument is supposed to be 1 indexed ([b435dee](https://github.com/mogelbrod/quick-opener/commit/b435deec954c27f5c9c7ec4bced1138f7ccc4827))

## [0.2.1](https://github.com/mogelbrod/quick-opener/compare/v0.2.0...v0.2.1) (2022-10-19)


### Bug Fixes

* Drop platform specific path separator from default fallbackDirectory value ([54afad9](https://github.com/mogelbrod/quick-opener/commit/54afad9e9d05f628f52d53e6c13253c274fcf46f))

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
