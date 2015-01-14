/* Challenge: https://www.interviewcake.com/question/find-duplicate-files
 * Solution Author: Devin Goodsell
 * Date: 01/14/2014
 *
 * You left your computer unlocked and your friend decided to troll you by
 * copying a lot of your files to random spots all over your file system.
 * Even worse, she saved the duplicate files with random, embarrassing names
 * ("this_is_like_a_digital_wedgie.txt" was clever, I'll give her that).
 *
 * Write a function that returns a list of all the duplicate files. We'll
 * check them by hand before actually deleting them, since programmatically
 * deleting files is really scary. To help us confirm that two files are
 * actually duplicates, make the returned list a list of tuples, where:
 *
 * the first item is the duplicate file
 * the second item is the original file
 */
/* jslint node:true, esnext:true */
'use strict';

const
  fs      = require('fs'),
  crypto  = require('crypto'),
  async   = require('async')
;

var
  fileChecksums = {},
  duplicateFiles = [],
  errorsEncounterd = []
;

var checkForDupliateFile = function(filePath, stats, callback) {
  var stream = fs.createReadStream(filePath);
  var hash = crypto.createHash('md5');
  stream.on('data', function(data) {
    hash.update(data, 'hex');
  });
  stream.on('error', function(err) {
    errorsEncounterd.push(err);
  });
  stream.on('end', function() {
    let checksum = hash.digest('hex');
    if (fileChecksums[checksum] === undefined) {
      fileChecksums[checksum] = {path: filePath, ctime: stats.ctime};
    } else {
      let foundFile = fileChecksums[checksum];

      // We will assume the duped file is the newest created file.
      let dupeIsNewFile = (stats.ctime > foundFile.ctime);
      duplicateFiles.push({
        duplicateFilePath: dupeIsNewFile ? filePath : foundFile.path,
        originalFilePath: dupeIsNewFile ? foundFile.path : filePath
      });
    }
    callback();
  });
};

var readAllFiles = function(folderPath, done) {
  // Get directories file and directories
  fs.readdir(folderPath, function(err, paths) {
    if (err) {
      errorsEncounterd.push(err);
      return done();
    }

    // Read each path
    async.each(paths, function (path, callback) {
      let fullPath = folderPath + '/' + path;
      fs.stat(fullPath, function(err, stats) {
        // On any errors just collect them so we can continue
        // searching all files.
        if (err) {
          errorsEncounterd.push(err);
          return callback();
        }

        if (stats.isFile())
          checkForDupliateFile(fullPath, stats, callback);
        else if (stats.isDirectory())
          readAllFiles(fullPath, callback);
        else
          callback();

      });
    }, function(err) {
      if (err)
        errorsEncounterd.push(err);

      done();
    });
  });
};

var start = function() {
  var pathToSearch = process.env.HOME + '/work/acting';

  readAllFiles(pathToSearch, function(err) {
    if (err)
      console.log('Errors encounterd: ', err);
    else if (duplicateFiles.length === 0)
      console.log('No duplicate files found.');
    else
      console.log('Dupes:', duplicateFiles);
  });
};

start();