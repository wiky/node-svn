svn.js
======
# Install

	npm install -g node.svn

# Usage

	var SVN = require('svn');
	var svn = new SVN();

	svn.co('http://svn.example.com/path/to/your/project', function (err, info) {
		// ..
	});


more read the API.

# API

first, `require svn.js` and `new`

	var SVN = require('svn');
	var svn = new SVN();

## SVN standard commands

API base on SVN standard commands ([svn command reference](http://riaoo.com/subpages/svn_cmd_reference.html))

### add

	svn.add(files[, callback])

### ci (or commit)

	svn.ci(files[, callback])

### info

todo
....


[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/wiky/node.svn/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

