/*
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

const fs = require('fs-extra');
const path = require('path');
const rewire = require('rewire');
const { events, PluginInfo } = require('cordova-common');

const templateDir = path.resolve(__dirname, '..', '..', '..', 'bin', 'templates');

const create = require(path.join(templateDir, '../lib/create'));
const Api = rewire(path.join(templateDir, 'cordova', 'Api'));

const tmpDir = path.join(__dirname, '../../../temp');
const apiRequire = Api.__get__('require');
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const pluginFixture = path.join(FIXTURES, 'testplugin');
const pluginFixtureEmptyJSModule = path.join(FIXTURES, 'testplugin-empty-jsmodule');
const pluginNotElectronFixture = path.join(FIXTURES, 'test-non-electron-plugin');
const pluginBrowserFixture = path.join(FIXTURES, 'test-browser-plugin');
const testProjectDir = path.join(tmpDir, 'testapp');

function dirExists (dir) {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function fileExists (file) {
    return fs.existsSync(file) && fs.statSync(file).isFile();
}

const mockExpectedLocations = {
    platformRootDir: testProjectDir,
    root: testProjectDir,
    www: path.join(testProjectDir, 'www'),
    res: path.join(testProjectDir, 'res'),
    platformWww: path.join(testProjectDir, 'platform_www'),
    configXml: path.join(testProjectDir, 'config.xml'),
    defaultConfigXml: path.join(testProjectDir, 'cordova/defaults.xml'),
    build: path.join(testProjectDir, 'build'),
    buildRes: path.join(testProjectDir, 'build-res'),
    cache: path.join(testProjectDir, 'cache'),
    cordovaJs: 'bin/templates/project/assets/www/cordova.js',
    cordovaJsSrc: 'cordova-js-src'
};

describe('Api class', () => {
    let api;
    let apiEvents;

    beforeAll(() => {
        fs.ensureDirSync(tmpDir);
        fs.copySync(path.resolve(FIXTURES, 'testapp'), path.resolve(tmpDir, 'testapp'));

        apiEvents = Api.__get__('selfEvents');
        apiEvents.addListener('verbose', (data) => { });
    });

    afterAll(() => {
        fs.removeSync(tmpDir);
        apiEvents.removeAllListeners();
    });

    beforeEach(() => {
        api = new Api(null, testProjectDir);
    });

    describe('constructor', () => {
        it('should have been constructed with initial values.', () => {
            expect(api).toBeDefined();
            /**
             * In Unit Testing:
             *   The API file path is located in "cordova-electron/bin/templates/cordova".
             *   The expected path is the "cordova-electron/bin/templates" dir.
             *
             * In production:
             *   The API file path is actually located in "<project_dir>/platforms/electron/cordova".
             *   The expected path is "<project_dir>/platforms/electron" which is the electron's platform root dir
             */
            expect(api.root).toEqual(testProjectDir);
            expect(api.locations).toEqual(jasmine.objectContaining(mockExpectedLocations));
        });
    });

    describe('getPlatformInfo method', () => {
        it('should return object containing platform information', () => {
            // Mocking require that is called to get version.
            Api.__set__('require', () => '1.0.0');

            expect(api.getPlatformInfo()).toEqual({
                locations: mockExpectedLocations,
                root: testProjectDir,
                name: 'electron',
                version: '1.0.0',
                projectConfig: undefined
            });

            Api.__set__('require', apiRequire);
        });
    });

    describe('prepare method', () => {
        it('should return object containing platform information', () => {
            const prepare = jasmine.createSpy('prepare');

            Api.__set__('require', () => ({ prepare }));
            api.prepare('', {});
            expect(prepare).toHaveBeenCalledWith(jasmine.any(String), jasmine.any(Object));
            Api.__set__('require', apiRequire);
        });
    });

    describe('addPlugin method', () => {
        beforeEach(() => {
            spyOn(events, 'emit');

            fs.removeSync(path.resolve(testProjectDir, 'electron.json'));
            fs.removeSync(path.resolve(testProjectDir, 'www'));
        });

        afterEach(() => {
            fs.removeSync(path.resolve(testProjectDir, 'electron.json'));
            fs.removeSync(path.resolve(testProjectDir, 'www'));

            apiEvents.removeAllListeners();
        });

        it('should Promise reject when missing PluginInfo parameter.', () => {
            return api.addPlugin().then(
                () => {},
                error => {
                    expect(error).toEqual(new Error('Missing plugin info parameter. The first parameter should contain a valid PluginInfo instance.'));
                }
            );
        });

        it('should error out when a PluginInfo parameter is not valid', () => {
            class FakePluginInfo {}
            return expect(() => {
                api.addPlugin(new FakePluginInfo());
            }).toThrowError();
        });

        describe('Use Electron Plugin with Default Install Options', () => {
            beforeEach(() => {
                const pluginInfo = new PluginInfo(pluginFixture);
                return api.addPlugin(pluginInfo);
            });

            it('should add the plugins assets and meta data.', () => {
                expect(dirExists(path.resolve(testProjectDir, 'www'))).toBeTruthy();
                expect(fileExists(path.resolve(testProjectDir, 'electron.json'))).toBeTruthy();
                expect(fileExists(path.resolve(testProjectDir, 'www/cordova_plugins.js'))).toBeTruthy();
                expect(fileExists(path.resolve(testProjectDir, 'www/js/electron.json'))).toBeTruthy();
                expect(fileExists(path.resolve(testProjectDir, 'www/plugins/org.apache.testplugin/www/plugin.js'))).toBeTruthy();
            });

            it('should emit that source-file is not supported.', () => {
                expect(events.emit).toHaveBeenCalledWith(
                    'verbose',
                    jasmine.stringMatching(/not supported/)
                );
            });

            it('should add a second plugins assets', () => {
                const pluginInfo2 = new PluginInfo(pluginBrowserFixture);
                return api.addPlugin(pluginInfo2).then(() => {
                    expect(fileExists(path.resolve(testProjectDir, 'www/plugins/org.apache.testbrowserplugin/www/plugin.js'))).toBeTruthy();
                });
            });

            it('should have "clobber", "merge", and "run" set when defined in "js-module".', () => {
                const { modules } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                expect(modules[0].clobbers).toBeDefined();
                expect(modules[0].merges).toBeDefined();
                expect(modules[0].runs).toBeDefined();
            });

            it('should have module id containing the name attribute value.', () => {
                const { modules } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                expect(modules[0].id).toBe('org.apache.testplugin.TestPlugin');
            });
        });

        // usePlatformWww
        describe('Use Empty JS-Module Plugin', () => {
            beforeEach(() => {
                const pluginInfo = new PluginInfo(pluginFixtureEmptyJSModule);
                return api.addPlugin(pluginInfo);
            });

            it('should not have "clobber", "merge", and "run" set when not defined in "js-module".', () => {
                const { modules } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                expect(modules[0].clobbers).not.toBeDefined();
                expect(modules[0].merges).not.toBeDefined();
                expect(modules[0].runs).not.toBeDefined();
            });

            it('should use js filename for plugin id if name is missing.', () => {
                const { modules } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                expect(modules[0].id).toBe('org.apache.testplugin2.MyTestPlugin2');
            });
        });

        describe('Use Electron Plugin with Custom Install Options', () => {
            beforeEach(() => {
                const pluginInfo = new PluginInfo(pluginFixture);
                return api.addPlugin(pluginInfo, {
                    variables: { PACKAGE_NAME: 'com.foobar.newpackagename' },
                    usePlatformWww: true
                });
            });

            it('should use custom package name.', () => {
                const { installed_plugins } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                expect(installed_plugins['org.apache.testplugin'].PACKAGE_NAME).toEqual('com.foobar.newpackagename');
            });

            it('should use platform www instead of www.', () => {
                expect(fileExists(path.resolve(testProjectDir, 'www/cordova_plugins.js'))).toBeFalsy();
                expect(fileExists(path.resolve(testProjectDir, 'platform_www/cordova_plugins.js'))).toBeTruthy();
            });
        });

        /**
         * @todo verfiy validity of an "unknown" itemType acgtually being able to be set.
         */
        it('should warn when unknown itemType is added.', () => {
            const pluginInfo = new PluginInfo(pluginFixture);
            pluginInfo.getAssets = () => [{ itemType: 'unknown' }];

            return api.addPlugin(pluginInfo).then(
                () => {
                    expect(events.emit).toHaveBeenCalledWith(
                        'warn',
                        jasmine.stringMatching(/Unrecognized type/)
                    );
                }
            );
        });

        it('should add browser plugins as well.', () => {
            const pluginInfo = new PluginInfo(pluginBrowserFixture);
            return api.addPlugin(pluginInfo).then(
                () => {
                    expect(dirExists(path.resolve(testProjectDir, 'www'))).toBeTruthy();
                    expect(fileExists(path.resolve(testProjectDir, 'electron.json'))).toBeTruthy();
                    expect(fileExists(path.resolve(testProjectDir, 'www', 'cordova_plugins.js'))).toBeTruthy();
                }
            );
        });
    });

    describe('removePlugin method', () => {
        beforeEach(() => {
            spyOn(events, 'emit');

            fs.removeSync(path.resolve(testProjectDir, 'electron.json'));
            fs.removeSync(path.resolve(testProjectDir, 'www'));
        });

        afterEach(() => {
            fs.removeSync(path.resolve(testProjectDir, 'electron.json'));
            fs.removeSync(path.resolve(testProjectDir, 'www'));

            apiEvents.removeAllListeners();
        });

        it('should Promise reject when missing PluginInfo parameter.', () => {
            return api.removePlugin().then(
                () => {},
                error => {
                    expect(error).toEqual(new Error('Missing plugin info parameter. The first parameter should contain a valid PluginInfo instance.'));
                }
            );
        });

        it('should error out when a PluginInfo parameter is not valid.', () => {
            class FakePluginInfo {}
            return expect(() => {
                api.removePlugin(new FakePluginInfo());
            }).toThrowError();
        });

        describe('Use Electron Plugin with Default Install Options', () => {
            let pluginInfo;

            beforeEach(() => {
                pluginInfo = new PluginInfo(pluginFixture);
                return api.addPlugin(pluginInfo);
            });

            it('should remove the empty plugin data from electron.json.', () => {
                return api.removePlugin(pluginInfo).then(
                    () => {
                        const { plugin_metadata, modules, installed_plugins } = fs.readJsonSync(path.resolve(testProjectDir, 'electron.json'));
                        expect(plugin_metadata).toEqual({});
                        expect(modules).toEqual([]);
                        expect(installed_plugins).toEqual({});
                    }
                );
            });

            it('should remove the added plugin assets, source files, and meta data.', () => {
                return api.removePlugin(pluginInfo).then(() => {
                    expect(dirExists(path.resolve(testProjectDir, 'www'))).toBeTruthy();
                    expect(fileExists(path.resolve(testProjectDir, 'electron.json'))).toBeTruthy();
                    expect(fileExists(path.resolve(testProjectDir, 'www/cordova_plugins.js'))).toBeTruthy();
                    expect(fileExists(path.resolve(testProjectDir, 'www/js/electron.json'))).toBeFalsy();
                    expect(fileExists(path.resolve(testProjectDir, 'www/plugins/org.apache.testplugin/www/plugin.js'))).toBeFalsy();

                    const cordovaPluginContent = fs.readFileSync(path.resolve(testProjectDir, 'www/cordova_plugins.js'), 'utf8');
                    expect(cordovaPluginContent).not.toContain(/org.apache.testplugin/);
                });
            });
        });

        it('should remove the added plugin assets, from the platform www.', () => {
            const pluginInfo = new PluginInfo(pluginFixture);
            return api.addPlugin(pluginInfo, { usePlatformWww: true })
                .then(() => api.removePlugin(pluginInfo, { usePlatformWww: true }))
                .then(() => {
                    expect(fileExists(path.resolve(testProjectDir, 'www/cordova_plugins.js'))).toBeFalsy();
                    expect(fileExists(path.resolve(testProjectDir, 'platform_www/cordova_plugins.js'))).toBeTruthy();
                });
        });

        /**
         * @todo verfiy validity of an "unknown" itemType acgtually being able to be set.
         */
        it('should remove the plugin assets and source files.', () => {
            const pluginInfo = new PluginInfo(pluginFixture);
            pluginInfo.getAssets = () => [{ itemType: 'unknown' }];

            return api.removePlugin(pluginInfo).then(() => {
                expect(events.emit).toHaveBeenCalledWith(
                    'warn',
                    jasmine.stringMatching(/unrecognized type/)
                );
            });
        });

        it('should remove the empty non-electron plugin using platform www as target.', () => {
            const pluginInfo = new PluginInfo(pluginNotElectronFixture);
            return api.addPlugin(pluginInfo, { usePlatformWww: true })
                .then(() => api.removePlugin(pluginInfo, { usePlatformWww: true }))
                .then(() => {
                    const cordovaPluginContent = fs.readFileSync(path.resolve(testProjectDir, 'platform_www/cordova_plugins.js'), 'utf8');
                    expect(cordovaPluginContent).not.toContain(/org.apache.testnonelectronplugin/);
                });
        });
    });

    describe('build method', () => {
        it('should execute build', () => {
            const call = jasmine.createSpy('run');
            const mockBuildOptions = { foo: 'bar' };

            Api.__set__('require', () => ({ run: { call: call } }));
            api.build(mockBuildOptions);
            expect(call).toHaveBeenCalledWith(api, mockBuildOptions, api);
            Api.__set__('require', apiRequire);
        });
    });

    describe('run method', () => {
        it('should execute run', () => {
            const run = jasmine.createSpy('run');
            const mockRunOptions = { foo: 'bar' };

            Api.__set__('require', () => ({ run }));
            api.run(mockRunOptions);
            expect(run).toHaveBeenCalledWith(mockRunOptions);
            Api.__set__('require', apiRequire);
        });
    });

    describe('clean method', () => {
        it('should execute clean', () => {
            const run = jasmine.createSpy('clean');
            const mockCleanOptions = { foo: 'bar' };

            Api.__set__('require', () => ({ run }));
            api.clean(mockCleanOptions);
            expect(run).toHaveBeenCalledWith(mockCleanOptions);
            Api.__set__('require', apiRequire);
        });
    });

    describe('requirements method', () => {
        it('should execute requirements', () => {
            const run = jasmine.createSpy('requirements');

            Api.__set__('require', () => ({ run }));
            api.requirements();
            expect(run).toHaveBeenCalled();
            Api.__set__('require', apiRequire);
        });
    });
});

describe('Api prototype methods', () => {
    describe('updatePlatform method', () => {
        it('should return a resolved promise.', () => {
            Api.updatePlatform().then(
                result => {
                    expect(result).toBeUndefined();
                }
            );
        });
    });

    describe('createPlatform method', () => {
        beforeEach(() => {
            fs.removeSync(tmpDir);
        });

        afterEach(() => {
            fs.removeSync(tmpDir);
        });

        /**
         * @todo improve createPlatform to test actual created platforms.
         */
        it('should export static createPlatform function', () => {
            spyOn(events, 'emit');

            return Api.createPlatform(tmpDir)
                .then((results) => {
                    expect(events.emit).toHaveBeenCalledWith(
                        'log',
                        jasmine.stringMatching(/Creating Cordova project/)
                    );

                    expect(results.constructor.name).toBe('Api');
                });
        });

        it('should emit createPlatform not callable when error occurs.', () => {
            spyOn(create, 'createProject').and.returnValue(new Error('Some Random Error'));
            expect(() => Api.createPlatform(tmpDir)).toThrowError();
        });
    });
});
