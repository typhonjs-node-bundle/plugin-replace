const { flags }   = require('@oclif/command');

const replace     = require('@rollup/plugin-replace');

/**
 * Handles interfacing with the plugin manager adding event bindings to pass back a configured
 * instance of `@rollup/plugin-replace`.
 */
class PluginHandler
{
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
         return replace(bundleData.cliFlags.replace);
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
   static onPluginLoad(ev)
   {
      ev.eventbus.on('typhonjs:oclif:rollup:plugins:main:input:get', PluginHandler.getInputPlugin, PluginHandler);
   }
}

/**
 * Oclif init hook to add PluginHandler to plugin manager.
 *
 * @param {object} opts - options of the CLI action.
 *
 * @returns {Promise<void>}
 */
module.exports = async function(opts)
{
   try
   {
      global.$$pluginManager.add({ name: '@typhonjs-node-bundle/plugin-replace', instance: PluginHandler });

      // Adds flags for various built in commands like `build`.
      s_ADD_FLAGS(opts.id);

      // TODO REMOVE
      process.stdout.write(`plugin-replace init hook running ${opts.id}\n`);
   }
   catch (error)
   {
      this.error(error);
   }
};

/**
 * Adds flags for various built in commands like `build`.
 *
 * To add handling of the *.env environment variables a double processing stage occurs in fvttdev build command. The
 * flags are processed to pull out the --env flag then if present `dotenv` is used to load the given *.env file.
 * We take advantage of the `default` definition for the `replace` flag below by providing a function that checks the
 * associated environment variable `DEPLOY_REPLACE`. If it is present then it is treated as a JSON array and any
 * parsing errors will halt execution of the CLI w/ the parse error shown to the user.
 *
 * A verification function is provided for FlagHandler which ensures that each entry is formatted as <xxx>=<yyy>
 * splitting the left and right hand values formatting the output into one unified object. Errors will be thrown if
 * the formatting is incorrect or if subsequent entries overwrite existing entries.
 *
 * Added flags include:
 * `--replace`   - `-r` - Replace constants with hard-coded values.  - default:           - env: DEPLOY_REPLACE
 *
 * @param {string} command - ID of the command being run.
 */
function s_ADD_FLAGS(command)
{
   switch (command)
   {
      // Add all built in flags for the build command.
      case 'bundle':
         global.$$eventbus.trigger('typhonjs:oclif:system:flaghandler:add', {
            command,
            plugin: 'plugin-replace',
            flags: {
               replace: flags.string({
                  'char': 'r',
                  'description': 'Replace constants with hard-coded values.',
                  'multiple': true,
                  'default': function()
                  {
                     if (typeof process.env.DEPLOY_REPLACE === 'string')
                     {
                        let result = void 0;

                        // Treat it as a JSON array.
                        try { result = JSON.parse(process.env.DEPLOY_REPLACE); }
                        catch (error)
                        {
                           const parseError = new Error(
                            `Could not parse 'DEPLOY_REPLACE' as a JSON array;\n${error.message}`);

                           // Set magic boolean for global CLI error handler to skip treating this as a fatal error.
                           parseError.$$bundler_fatal = false;

                           throw parseError;
                        }

                        // Verify that the JSON result loaded is an actual array otherwise quit with and error...
                        if (!Array.isArray(result))
                        {
                           const parseError = new Error(`Please format 'DEPLOY_REPLACE' as a JSON array.`);

                           // Set magic boolean for global CLI error handler to skip treating this as a fatal error.
                           parseError.$$bundler_fatal = false;

                           throw parseError;
                        }

                        // TODO: consider adding verification that the loaded array from JSON contains all strings.

                        return result;
                     }

                     return void 0;
                  }
               })
            },

            /**
             * Verifies the `replace` flag and checks that the data loaded is an array, and then attempts to parse each
             * entry. If an entry is not a string in the format of <xxx>=<yyy> an error is generated. An error is also
             * generated if an entry overwrites a previous entry which occurs when there are multiple left hand values
             * of the same string.
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

                  let errorMessage = 'plugin-replace verification failure:\n';

                  if (badEntries.length > 0)
                  {
                     errorMessage += `- can not parse ${JSON.stringify(badEntries)} each `
                      + `entry must be a 'string' in the format of '<xxx>=<yyy>'.`;
                  }

                  if (warnEntries.length > 0)
                  {
                     errorMessage += `${badEntries.length > 0 ? '\n' : ''}- the following `
                     + `entries overwrite previous entries ${JSON.stringify(warnEntries)}.`;
                  }

                  if (errorMessage !== 'plugin-replace verification failure:\n')
                  {
                     const error = new Error(errorMessage);

                     // Set magic boolean for global CLI error handler to skip treating this as a fatal error.
                     error.$$bundler_fatal = false;

                     throw error;
                  }
               }
            }
         });
         break;
   }
}