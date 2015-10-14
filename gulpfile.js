'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var merge = require('merge-stream');
var path = require('path');
var historyApiFallback = require('connect-history-api-fallback');
var vulcanize = require('gulp-vulcanize');
var crisper = require('gulp-crisper');
var minifyHTML = require('gulp-minify-html');
var minifyInline = require('gulp-minify-inline');
var stripDebug = require('gulp-strip-debug');
var uglify = require('gulp-uglify');

var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

var styleTask = function (stylesPath, srcs) {
  return gulp.src(srcs.map(function(src) {
    return path.join('app', stylesPath, src);
  }))
      .pipe($.changed(stylesPath, {extension: '.css'}))
      .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
      .pipe(gulp.dest('.tmp/' + stylesPath))
      .pipe($.cssmin())
      .pipe(gulp.dest('dist/' + stylesPath))
      .pipe($.size({title: stylesPath}));
};

// Compile and automatically prefix stylesheets
gulp.task('styles', function () {
  return styleTask('styles', ['**/*.css']);
});

gulp.task('elements', function () {
  return styleTask('elements', ['**/*.css']);
});

// Lint JavaScript
gulp.task('jshint', function () {
  return gulp.src([
    'app/scripts/**/*.js',
    'app/elements/**/*.js',
    'app/elements/**/*.html',
    'gulpfile.js'
  ])
      .pipe(reload({stream: true, once: true}))
      .pipe($.jshint.extract()) // Extract JS from .html files
      .pipe($.jshint())
      .pipe($.jshint.reporter('jshint-stylish'))
      .pipe($.if(!browserSync.active, $.jshint.reporter('fail')));
});

// Optimize images
gulp.task('images', function () {
  return gulp.src('app/images/**/*')
      .pipe($.cache($.imagemin({
        progressive: true,
        interlaced: true
      })))
      .pipe(gulp.dest('dist/images'))
      .pipe($.size({title: 'images'}));
});

// Copy all files at the root level (app)
gulp.task('copy', function () {
  var app = gulp.src([
    'app/*',
    '!app/test',
    '!app/cache-config.json'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'));

  var bower = gulp.src([
    'bower_components/**/*'
  ]).pipe(gulp.dest('dist/bower_components'));

  var elements = gulp.src(['app/elements/**/*.html'])
      .pipe(gulp.dest('dist/elements'));

  var vulcanized = gulp.src(['app/elements/elements.html'])
      .pipe($.rename('elements.vulcanized.html'))
      .pipe(gulp.dest('dist/elements'));

  return merge(app, bower, elements, vulcanized)
      .pipe($.size({title: 'copy'}));
});

// Scan your HTML for assets & optimize them
gulp.task('html', function () {
  var assets = $.useref.assets({searchPath: ['.tmp', 'app', 'dist']});

  return gulp.src(['app/**/*.html', '!app/{elements,test}/**/*.html'])
      .pipe($.if('*.html', $.replace('elements/elements.html', 'elements/elements.vulcanized.html')))
      .pipe(assets)
      .pipe($.if('*.js', $.uglify({preserveComments: 'some'})))
      .pipe($.if('*.css', $.cssmin()))
      .pipe(assets.restore())
      .pipe($.useref())
      .pipe(gulp.dest('dist'))
      .pipe($.size({title: 'html'}));
});

// Polybuild will take care of inlining HTML imports, scripts and CSS for you.
gulp.task('vulcanize', function () {
  return gulp.src('dist/index.html')
      .pipe(vulcanize({
        abspath: '',
        excludes: [],
        stripExcludes: false,
        inlineScripts: true,
        inlineCss: true
      }))
      .pipe(crisper())
      .pipe(gulp.dest('dist/'));
});

// Rename Polybuild's index.build.html to index.html
gulp.task('rename-index', function () {
  gulp.src('dist/index.build.html')
      .pipe($.rename('index.html'))
      .pipe(gulp.dest('dist/'));
  return del(['dist/index.build.html']);
});

// Clean output directory
gulp.task('clean', function (cb) {
  del(['.tmp', 'dist'], cb);
});

// Clean unuseful elements from output directory
gulp.task('final-clean', function(cb) {
  del(['dist/elements', 'dist/bower_components', 'dist/styles', 'dist/scripts'], cb);
});

gulp.task('minify-html', function(){
  return gulp.src('dist/index.html')
      .pipe(minifyHTML({ conditionals: true, spare: true, empty: true }))
      .pipe(minifyInline())
      .pipe(gulp.dest('dist/'));
});

gulp.task('uglify-js', function(){
  return gulp.src('dist/index.js')
      .pipe(stripDebug())
      .pipe(uglify())
      .pipe(gulp.dest('dist/'));
});

// Watch files for changes & reload
gulp.task('serve', ['styles', 'elements', 'images'], function () {
  browserSync({
    port: 5000,
    notify: false,
    logPrefix: 'PA',
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function (snippet) {
          return snippet;
        }
      }
    },
    server: {
      baseDir: ['.tmp', 'app'],
      middleware: [ historyApiFallback() ],
      routes: {
        '/bower_components': 'bower_components'
      }
    }
  });

  gulp.watch(['app/**/*.html'], reload);
  gulp.watch(['app/styles/**/*.css'], ['styles', reload]);
  gulp.watch(['app/elements/**/*.css'], ['elements', reload]);
  gulp.watch(['app/{scripts,elements}/**/{*.js,*.html}'], ['jshint']);
  gulp.watch(['app/images/**/*'], reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function () {
  browserSync({
    port: 5001,
    notify: false,
    logPrefix: 'PA',
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function (snippet) {
          return snippet;
        }
      }
    },
    server: 'dist',
    middleware: [ historyApiFallback() ]
  });
});

gulp.task('default', ['clean'], function (cb) {
  runSequence(
      ['copy', 'styles'],
      'elements',
      ['jshint', 'images', 'html'],
      'vulcanize',
      'rename-index',
      'final-clean',
      ['minify-html', 'uglify-js'],
      cb);
});

// Load tasks for web-component-tester
// Adds tasks for `gulp test:local` and `gulp test:remote`
require('web-component-tester').gulp.init(gulp);

// Load custom tasks from the `tasks` directory
try { require('require-dir')('tasks'); } catch (err) {}