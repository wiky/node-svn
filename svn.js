/**
 * @file SVN class file
 *
 * @author wiky
 * @copyright none
 * @license https://raw.githubusercontent.com/wiky/node.svn/master/LICENSE MIT
 * @package node.svn
 *
 * @requires promise
 *
 * @version 0.1.3
 */

var spawn = require('child_process').spawn;
var fs = require('fs');
var nodePath = require('path');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var promise = require('./lib/promise').promise;

/**
   [o] = svn standard method & finished
   [+] = not svn standard method, new add & finished
   [ ] = todo

[o] svn.add
[ ] svn.blame
[ ] svn.cat
[+] svn.choose
[o] svn.ci = svn.commit
[ ] svn.cl = svn.changeList
[o] svn.cleanup
[o] svn.co = svn.checkout
[ ] svn.cp = svn.copy
[ ] svn.di = svn.diff
[o] svn.info
[ ] svn.lock
[o] svn.log
[o] svn.ls = svn.list
[+] svn.queue
[ ] svn.resolve
[ ] svn.revert
[ ] svn.rm = svn.remove = svn.del
[+] svn.run
[o] svn.st = svn.status
[o] svn.sw = svn.switchTo
[+] svn.type
[ ] svn.unlock
[o] svn.up = svn.update
 */


/**
 * @class SVN
 * @description node svn command
 * @param  {Object|string} config config, when string, same as config.cwd
 * @param  {string} config.cwd Current work directory
 * @param  {string} [config.username]
 * @param  {string} [config.password]
 * @param  {Function} callback Callback to call afterwards
 */
var SVN = function(config, callback) {
	var _this = this;
	this.config = (typeof config === 'string') ? {
		cwd: config
	} : (config || {});
	if (!this.config.cwd) {
		throw new Error('[SVN Error] no cwd');
	}
	if (!fs.existsSync(this.config.cwd)) {
		fs.mkdirSync(this.config.cwd);
	}
	this.root = this.config.cwd || '';
	this.run(['--version'], callback);
};

util.inherits(SVN, EventEmitter);

var svn = SVN.prototype;

/**
 * @method add
 * @memberof SVN
 * @description `svn add` command wrapper.
 * The `svn add` commands add specified files/directory under version control, recursivelly. If the add operation reach a folder that was not modified since last commit, it will not recurse in it. You can use the `--force` option to disable this behavior and deep explore every folder.
 * @param  {string}		path		Path to add
 * @param  {string[]}	[options]	Optional. Options (like `--force` as explained above)
 * @param  {Function}	callback	Function to execute afterwards
 * @see [svn add documentation]{@link http://svnbook.red-bean.com/en/1.6/svn.ref.svn.c.add.html}
 * @instance
 */
svn.add = function(path, options, callback) {
	if(typeof options != "undefined" && options != null && options.constructor.name == "Function" && typeof callback == "undefined"){ // If was called by `svn.add(path, cb)`
		callback = options;
		options = [];
	}
	if(typeof options != "undefined" && options != null && options.constructor.name == "String"){ // If a single string option is provided, wrap it in array
		options = [options];
	}
	if(typeof options != "undefined" && options != null && options.constructor.name != "Array"){ // This is not an array, reject it
		options = [];
	}

	return this.run(['add'].concat(options, [nodePath.join(this.root, path)]), function(err, text) {
		if (callback) {
			callback(err, helper.parseActions(text));
		}
	});
};

svn.choose = function(url, files, callback, cwd) {
	files = [].concat(files);
	var _this = this,
		toExecFn = [],
		doExecFn = function(args) {
			var path = args.path.replace(/^\/|\/$/, ''),
				ret;
			if (args.way === 'info') {
				ret = _this.info(function(err, result) {
					return result;
				}, cwd);
			} else if ((args.way === 'co-empty' || args.way === 'co') && args.err) {
				// [directroy is not exist] or [directroy is not a working copy]
				// create and checkout directroy
				ret = _this.co([
					url.replace(/\/$/, '') + (path ? '/' + path : ''),
					path,
					args.way === 'co' ? '--depth=infinity' : '--depth=empty'
				].join(' '), cwd);
			} else if (args.way === 'up-empty') {
				ret = _this.up([
					path,
					'--depth=empty'
				], cwd);
			} else {
				ret = _this.up(path, cwd);
			}
			return ret;
		};

	toExecFn.push(
		// getInfo

		function() {
			var args = {
				path: '',
				way: 'info'
			};
			return doExecFn(args);
		},
		// checkout

		function(err) {
			var args = {
				path: '',
				way: files.length > 0 ? 'co-empty' : 'co',
				err: err
			};
			return doExecFn(args);
		}
	);
	files.forEach(function(file) {
		var arr = file.replace(/^\/|\/$/, '').replace(/\/?[^\/]+\/?/g, '$`$&,').split(',');
		arr.pop();
		arr.forEach(function(path, i) {
			var way = 'up-empty',
				cwd = '';
			// update all
			if (i === arr.length - 1) {
				way = 'up';
			}
			cwd = nodePath.join(_this.root, arr[0]);
			toExecFn.push((function(args) {
				return function(err) {
					return doExecFn(args);
				};
			})({
				path: path,
				way: way,
				cwd: cwd
			}));
		});
	});
	return this.queue(toExecFn, function() {
		if (callback) {
			callback.call(_this);
		}
	});
};

/**
 * svn co
 * @param  {string}   command  url[[ name] ARGS]
 * @param  {Function} callback
 */
svn.co = svn.checkout = function(command, callback, cwd) {
	var _this = this,
		args = [],
		options = command.split(/\s+/) || [],
		url = options.shift(),
		name = options[0];

	if (typeof callback === 'string') {
		cwd = callback;
		callback = null;
	}

	if (!name || name.substr(1, 1) === '-') {
		name = nodePath.basename(this.root);
		cwd = cwd || nodePath.dirname(this.root);
	} else {
		name = '';
	}

	args = ['checkout', url].concat(name ? [name] : []).concat(options);

	return this.run(args, function(err, text) {
		if (callback) {
			callback(err, helper.parseActions(text));
		}
	}, cwd);
};

/**
 * @method cp
 * @alias copy
 * @memberof SVN
 * @description `svn cp` command wrapper.
 * The `svn cp` command copy files with their versionning infos into another location.
 * @param	{string|string[]}		source		The source file/directory, or an array of files/directories that will be copied
 * @param	{string}				dest		Destination path to copy sources to.
 * @param	{string[]}				[options]	Optional. Additionnal arguments to pass to cp command. See the docs
 * @param	{Function}				callback	Function to execute afterwards
 * @see [svn cp documentation]{@link http://svnbook.red-bean.com/en/1.6/svn.ref.svn.c.copy.html}
 * @instance
 */
svn.cp = svn.copy = function(source, dest, options, callback){
	if(source && source.constructor.name == "String"){
		source = [source];
	}
	if(typeof options != "undefined" && options != null && options.constructor.name == "Function" && typeof callback == "undefined"){ // If was called by `svn.add(path, cb)`
		callback = options;
		options = [];
	}
	if(typeof options != "undefined" && options != null && options.constructor.name == "String"){ // If a single string option is provided, wrap it in array
		options = [options];
	}
	if(typeof options != "undefined" && options != null && options.constructor.name != "Array"){ // This is not an array, reject it
		options = [];
	}

	// Need to test existence of path for cp
	var instance = this;
	fs.stat(nodePath.resolve(instance.root, dest), function(err, stats){
		// End cb stored in function because of multiple call points
		function endCp(){
			return instance.run(['cp'].concat(options, source, [dest]), function(err, text) {
				if (callback) {
					callback(err, helper.parseActions(text));
				}
			});
		}

		// If the dest directory does not exists...
		if(err || !stats.isDirectory()){
			// Recurse for create directory
			function mkdirParent(dirPath, mode, cb) {
				if(typeof mode != "undefined" && mode != null && mode.constructor.name == "Function" && typeof cb == "undefined"){ // If was called by `svn.add(path, cb)`
					cb = mode;
					mode = null;
				}
				//Call the standard fs.mkdir
				fs.mkdir(dirPath, mode, function(error){
					//When it fail in this way, do the custom steps
					if (error && error.errno === -2) {
						//Create all the parents recursively
						return mkdirParent(nodePath.dirname(dirPath), mode, function(){
							//And then the directory
							mkdirParent(dirPath, mode, cb);
						});
					} else {
						//Manually run the callback since we used our own callback to do all these
						cb && cb(error);
					}
				});
			};
			return mkdirParent(nodePath.dirname(nodePath.resolve(instance.root, dest)), endCp);
		} else {
			// Else directly end
			return endCp();
		}
	});
}

svn.up = svn.update = function(command, callback, cwd) {
	if (typeof callback === 'string') {
		cwd = callback;
		callback = null;
	}

	if (typeof command === 'function') {
		callback = command;
		command = null;
	}

	var _this = this,
		args = ['update'].concat(command ? [].concat(command) : []);

	if (!command || (command && command.indexOf('--accept') === -1)) {
		args = args.concat(['--accept', 'postpone']);
	}
	return this.run(args, function(err, text) {
		if (callback) {
			callback(err, helper.parseActions(text));
		}
	}, cwd);
};

svn.sw = svn.switchTo = function(url, callback) {
	var _this = this;
	return this.run(['switch', url, this.root, '--accept', 'postpone'], callback);
};

svn.ls = svn.list = function(path, callback) {
	return this.run(['list', path], function(err, info) {
		var data = null;
		if (!err) {
			data = info.replace(/\s*\r?\n\s*$/, '').split(/\s*\r?\n\s*/);
		}
		(data || []).forEach(function(value, i) {
			var type = /\/$/.test(value) ? 'directory' : 'file';
			data[i] = {
				name: value.replace(/\/$/, ''),
				type: type
			};
		});
		if (callback) {
			callback(err, data);
		}
	});
};

svn.info = function(command, callback, cwd) {
	if (typeof callback === 'string') {
		cwd = callback;
		callback = null;
	}

	if (typeof command === 'function') {
		callback = command;
		command = '';
	}
	var _this = this,
		args = ['info'].concat(command.split(/\s+/));

	return this.run(args, function(err, text) {
		var ret;
		if (!err) {
			ret = callback(null, helper.parseInfo(text));
		} else {
			ret = callback(err, null);
		}
		return ret;
	}, cwd);
};

svn.type = function(url, callback) {
	var _this = this;
	return this.run(['info', url], function(err, info) {
		var data, type = '';
		if (!err) {
			data = helper.parseInfo(info);
			type = data.nodekind;
		}
		if (callback) {
			callback(err, type);
		}
	});
};

svn.log = function(command, callback) {
	command = command || '';
	if (typeof command === 'function') {
		callback = command;
		command = '';
	}
	var _this = this,
		args = ['log'].concat(command.split(/\s+/)).concat(['-v']);
	return this.run(args, function(err, text) {
		if (!err) {
			_this.info(function(err, info) {
				callback(null, helper.parseLog(text, info));
			});
		} else {
			callback(err, null);
		}
	});
};

svn.queue = function(queue, callback) {
	var _this = this,
		chain = promise.chain(queue);
	chain.then(function() {
		if (callback) {
			callback.apply(_this, arguments);
		}
	});
	return chain;
};

svn.st = svn.status = function(callback) {
	var _this = this;
	return this.run(['status'], function(err, text) {
		var ret = null;
		if (!err) {
			ret = callback(null, helper.parseStatus(text));
		} else {
			ret = callback(err, null);
		}
		return ret;
	}, this.root);
};

svn.ci = svn.commit = function(files, message, callback) {
	var _this = this,
		args = ['ci', '-m', '"' + message + '"'].concat([].concat(files).map(function(file) {
			return file && nodePath.join(_this.root, file);
		}));
	return this.run(args, callback);
};


svn.cleanup = function(path, callback) {
	if (typeof path === 'function') {
		callback = path;
		path = '';
	}
	return this.run(['cleanup', path], callback);
};

svn.run = function(args, callback, cwd) {
	var _this = this,
		config = this.config,
		text = '',
		err = null,
		cmd = 'svn',
		proc,
		p = new promise.Promise();
	cwd = cwd || this.root;

	args = args.concat(['--non-interactive', '--trust-server-cert']);

	if (config && config.username && config.password) {
		args = args.concat(['--username', config.username, '--password', config.password]);
	}

	this.emit('cmd', proc, cmd, args);

	console.info('[SVN INFO]', cwd || this.root, '>', cmd, args.join(' ').replace(config.password, '******'));

	// check cwd
	if (!fs.existsSync(cwd)) {
		err = new Error('\'' + cwd + '\' is not exist');
		p.done(err);
		return p;
	}
	// exec command
	proc = spawn(cmd, args, {
		cwd: cwd
	});

	proc.stdout.on('data', function(data) {
		text += data;
	});

	proc.stderr.on('data', function(data) {
		data = String(data);
		err = new Error(data);
		console.log('[SVN ERROR]', data);
	});

	proc.on('error', function(error) {
		var result = null;
		err = new Error('[SVN ERROR:404] svn command not found');
		if (error.code === 'ENOENT') {
			// Force kill now. Callback will be executed when `ChildProcess#close` will be emitted
			proc.kill('ENOENT');
			return;
		}
		p.done(err, result);
	});
	
	proc.on('close', function(code) {
		var result = null;
		if (callback) {
			result = callback(err, text);
		}
		p.done(err, result);
	});

	this.proc = proc;

	return p;
};


var helper = {
	parseActions: function(text) {
		var array = text.replace(/\r\n/g, '\n').split('\n'),
			actions = [];
		array.forEach(function(line) {
			var matched = line.match(/\s*([ADUCGEM]|Restored)\s+([^\s]*)\s*/);
			if (matched && matched[1] && matched[2]) {
				actions.push({
					status: matched[1],
					path: matched[2].replace(/\'/g, '')
				});
			}
		});
		/*
         * A Added
         * D Deleted
         * U Updated
         * C Conflict
         * G Merged
         * E Exists
         */
		return actions;
	},
	parseInfo: function(text) {
		var array = text.replace(/\r\n/g, '\n').split('\n'),
			info = {};
		array.forEach(function(line) {
			var firstColon = line.indexOf(':');
			info[line.substring(0, firstColon).replace(/\s*/g, '').toLowerCase()] = line.substring(firstColon + 1).trim();
		});
		return info;
	},
	parseStatus: function(text) {
		var split = text.replace(/\r\n/g, '\n').split('\n'),
			changes = [],
			line;

		for (var i = 0; i < split.length; i += 1) {
			line = split[i];
			if (line.trim().length > 1) {
				changes.push({
					status: line[0],
					path: line.substr(1).trim()
				});
			}
		}
		return changes;
	},
	parseLog: function(text, info) {
		var array = text.replace(/\r\n/g, '\n').split(/-{2}/),
			logList = [],
			item,
			i;

		array.forEach(function(a) {
			if (!a) {
				return;
			}
			item = helper.parseLogEntry(a, info);
			if (item) {
				logList.push(item);
			}
		});
		return logList;
	},
	parseLogEntry: function(logText, info) {
		var array = logText.split(/\n/),
			log = {},
			i = 0,
			header = array[0],
			changeString,
			changeArray,
			relativeUrl = info.relativeurl.replace('^', '');

		while (header === '') {
			header = array[i += 1];
		}

		if (!header) {
			return null;
		}

		header = header.split(/\s*\|\s*/);

		log.revision = header[0].substr(1);
		log.author = header[1];
		log.date = new Date(header[2]);
		log.files = [];
		log.changes = [];
		log.info = info;

		for (i = i + 2; i < array.length; i += 1) {
			changeString = array[i].trim();
			if (changeString === '') {
				break;
			}
			changeArray = changeString.split(/\s+/);
			if (changeArray[1].indexOf(relativeUrl) !== -1) {
				log.files.push({
					path: changeArray[1].replace(relativeUrl, ''),
					status: changeArray[0]
				});
			}
			log.changes.push({
				path: changeArray[1],
				status: changeArray[0]
			});
		}

		log.message = '';

		for (i += 1; i < array.length - 1; i += 1) {
			log.message += array[i];
			if (i !== array.length - 2) {
				log.message += '\n';
			}
		}
		return log;
	}
};

module.exports = function(config, callback) {
	return new SVN(config, callback);
};
