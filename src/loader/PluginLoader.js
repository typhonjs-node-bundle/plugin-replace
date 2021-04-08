import replace             from '@rollup/plugin-replace';

import { NonFatalError }   from '@typhonjs-oclif/errors';

const s_CONFLICT_PACKAGES = ['@rollup/plugin-replace'];
const s_PACKAGE_NAME = '@typhonjs-node-rollup/plugin-replace';

/**
 * Handles interfacing with the plugin manager adding event bindings to pass back a configured
 * instance of `@rollup/plugin-replace`.
 */
export default class PluginLoader
{
   /**
    * Returns the any modules that cause a conflict.
    *
    * @returns {string[]} An array of conflicting packages.
    */
   static get conflictPackages() { return s_CONFLICT_PACKAGES; }

   /**
    * Returns the `package.json` module name.
    *
    * @returns {string} Package name.
    */
   static get packageName() { return s_PACKAGE_NAME; }

   /**
    * Adds flags for various built in commands like `bundle`.
    *
    * To add handling of the *.env environment variables a double processing stage occurs in fvttdev build command. The
    * flags are processed to pull out the --env flag then if present `dotenv` is used to load the given *.env file.
    * We take advantage of the `default` definition for the `replace` flag below by providing a function that checks the
    * associated environment variable `{prefix}_REPLACE`. If it is present then it is treated as a JSON array and any
    * parsing errors will halt execution of the CLI w/ the parse error shown to the user.
    *
    * A verification function is provided for FlagHandler which ensures that each entry is formatted as <xxx>=<yyy>
    * splitting the left and right hand values formatting the output into one unified object. Errors will be thrown if
    * the formatting is incorrect or if subsequent entries overwrite existing entries.
    *
    * Added flags include:
    * `--replace`   - `-r` - Replace constants with hard-coded values.  - default:           - env: {prefix}_REPLACE
    *
    * @param {object} eventbus - The eventbus to add flags to.
    *
    * @param {object} flags - The Oclif flags generator.
    */
   static addFlags(eventbus, flags)
   {
      eventbus.trigger('typhonjs:oclif:handler:flag:add', {
         command: 'bundle',
         pluginName: PluginLoader.packageName,
         flags: {
            replace: flags.string({
               'char': 'r',
               'description': 'Replace constants with hard-coded values.',
               'multiple': true,
               'default': function(context)
               {
                  const envVars = context === null ? {} : process.env;
                  const envVar = `${globalThis.$$cli_env_prefix}_REPLACE`;

                  if (typeof envVars[envVar] === 'string')
                  {
                     let result = void 0;

                     // Treat it as a JSON array.
                     try { result = JSON.parse(envVars[envVar]); }
                     catch (error)
                     {
                        throw new NonFatalError(
                         `Could not parse '${envVar}' as a JSON array;\n${error.message}`);
                     }

                     // Verify that the JSON result loaded is an actual array otherwise quit with and error...
                     if (!Array.isArray(result))
                     {
                        throw new NonFatalError(`Please format '${envVar}' as a JSON array.`);
                     }

                     // TODO: consider adding verification that the loaded array from JSON contains all strings.

                     return result;
                  }

                  return void 0;
               }
            })
         },

         /**
          * Verifies the `replace` flag and checks that the data loaded is an array, and then attempts to parse
          * each entry. If an entry is not a string in the format of <xxx>=<yyy> an error is generated. An error
          * is also generated if an entry overwrites a previous entry which occurs when there are multiple left
          * hand values of the same string.
          *
          * @param {object}   flags - The CLI flags to verify.
          */
         verify: function(flags)
         {
            const regex = /(.+)=(.+)/;

            // replace should always be an array
            if (Array.isArray(flags.replace))
            {
               const badEntries = [];
               const warnEntries = [];

               const entries = {};

               flags.replace.forEach((entry) =>
               {
                  const matches = regex.exec(entry);

                  if (matches !== null && matches.length >= 3)
                  {
                     // If the left hand match is already in the entries object as a key then add the current
                     // entry to the warn list.
                     if (matches[1] in entries)
                     {
                        warnEntries.push(entry);
                     }
                     else
                     {
                        entries[matches[1]] = matches[2];
                     }
                  }
                  else
                  {
                     badEntries.push(entry);
                  }
               });

               flags.replace = entries;

               // TODO: TEMPORARILY ADD DELIMITERS; REMOVE WHEN SWITCH TO `env-resolve`.
               flags.replace.delimiters = ['', ''];

               let errorMessage = 'plugin-replace verification failure:\n';

               if (badEntries.length > 0)
               {
                  errorMessage += `- can not parse ${JSON.stringify(badEntries)} each ` +
                   `entry must be a 'string' in the format of '<xxx>=<yyy>'.`;
               }

               if (warnEntries.length > 0)
               {
                  errorMessage += `${badEntries.length > 0 ? '\n' : ''}- the following ` +
                   `entries overwrite previous entries ${JSON.stringify(warnEntries)}.`;
               }

               if (errorMessage !== 'plugin-replace verification failure:\n')
               {
                  throw new NonFatalError(errorMessage);
               }
            }
         }
      });
   }

   /**
    * Returns the configured input plugin for `@rollup/plugin-replace`
    *
    * @param {object} bundleData        - The CLI config
    * @param {object} bundleData.cliFlags  - The CLI config
    *
    * @returns {object} Rollup plugin
    */
   static getInputPlugin(bundleData = {})
   {
      if (bundleData.cliFlags && typeof bundleData.cliFlags.replace === 'object')
      {
         return replace(Object.assign(bundleData.cliFlags.replace, { preventAssignment: true }));
      }
   }

   /**
    * Wires up PluginHandler on the plugin eventbus.
    *
    * @param {PluginEvent} ev - The plugin event.
    *
    * @see https://www.npmjs.com/package/typhonjs-plugin-manager
    *
    * @ignore
    */
   static async onPluginLoad(ev)
   {
      ev.eventbus.on('typhonjs:oclif:bundle:plugins:main:input:get', PluginLoader.getInputPlugin, PluginLoader);

      const flags = await import(ev.pluginOptions.flagsModule);

      PluginLoader.addFlags(ev.eventbus, flags);
   }
}
