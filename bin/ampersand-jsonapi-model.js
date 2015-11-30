'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ampersandModel = require('ampersand-model');

var _ampersandModel2 = _interopRequireDefault(_ampersandModel);

var _ampersandJsonapiAjaxconfig = require('ampersand-jsonapi-ajaxconfig');

var _ampersandJsonapiAjaxconfig2 = _interopRequireDefault(_ampersandJsonapiAjaxconfig);

var _lodash = require('lodash.assign');

var _lodash2 = _interopRequireDefault(_lodash);

var _lodash3 = require('lodash.foreach');

var _lodash4 = _interopRequireDefault(_lodash3);

var _lodash5 = require('lodash.isobject');

var _lodash6 = _interopRequireDefault(_lodash5);

var _lodash7 = require('lodash.result');

var _lodash8 = _interopRequireDefault(_lodash7);

var _lodash9 = require('lodash.transform');

var _lodash10 = _interopRequireDefault(_lodash9);

var _lodash11 = require('lodash.keys');

var _lodash12 = _interopRequireDefault(_lodash11);

var _lodash13 = require('lodash.intersection');

var _lodash14 = _interopRequireDefault(_lodash13);

var _lodash15 = require('lodash.reduce');

var _lodash16 = _interopRequireDefault(_lodash15);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; } /**
                                                                                                                              * @file {@link JSONAPIModel} module: a base model extending
                                                                                                                              * AmpersandModel that parses data received from JSONAPI-compatible
                                                                                                                              * servers.
                                                                                                                              * @module classes/json-api-model
                                                                                                                              * @see JSONAPIModel
                                                                                                                              * @see module:classes/json-api-collection
                                                                                                                              */

function transformForPatch(obj, atts) {
  var attrKeys = (0, _lodash12.default)(atts);

  if (!(0, _lodash6.default)(obj)) {
    return obj;
  }

  return (0, _lodash10.default)(obj, function (r, v, k) {
    // If all attributes are within the object
    if ((0, _lodash14.default)((0, _lodash12.default)(v), attrKeys).length === attrKeys.length) {
      // set this object to the subset of passed-in atts
      r[k] = (0, _lodash16.default)(attrKeys, function (redux, attrKey) {
        redux[attrKey] = atts[attrKey];
        return redux;
      }, {});
    } else {
      // run transformForPatch on the next level
      r[k] = transformForPatch(v, atts);
    }
  });
}

/**
 * Creates a new JSONAPI Model.
 * @constructor
 * @alias JSONAPIModel
 * @see JSONAPICollection
 * @requires AmpersandModel
 * @requires ampersand-jsonapi-ajaxconfig
 * @extends AmpersandModel
 * @mixes ampersand-jsonapi-ajaxconfig
 * @argument {Array} attrs    - The initial value of the attributes to
 *                              set on the model.
 * @argument {Object} options - The set of options to be used by
 *                              AmpersandModel
 */
var JSONAPIModel = _ampersandModel2.default.extend(_ampersandJsonapiAjaxconfig2.default, {

  /**
   * Initializes collections as type defined in model definition.
   * @method _initCollections
   * @memberof JSONAPIModel
   * @instance
   * @private
   * @returns {Object} An instance of the collection type
   */

  _initCollections: function _initCollections() {
    if (!this._collections) {
      return;
    }

    for (var coll in this._collections) {
      this[coll] = new this._collections[coll](null, { parent: this, parse: true });
    }
  },

  /**
   * Initializes child models as type defined in model definition.
   * @method _initChildren
   * @memberof JSONAPIModel
   * @instance
   * @private
   * @returns {Object} An instance of the child model type
   */
  _initChildren: function _initChildren() {
    if (!this._children) {
      return;
    }
    for (var child in this._children) {
      var childAttrs = this._attrs && this._attrs[child] ? this._attrs[child] : {};
      this[child] = new this._children[child](childAttrs, { parent: this, parse: true });
      this.listenTo(this[child], 'all', this._getEventBubblingHandler(child));
    }
  },

  /**
   * Returns model and associated children and collections as a plain
   * object.
   * @method getAttributes
   * @memberof JSONAPIModel
   * @instance
   * @override
   * @param {Object} opts - The options for getAttributes.
   * @param {Boolean} raw - Specifies whether returned values should be
   *                        the raw value or should instead use the
   *                        getter associated with its data type.
   * @returns {Object} The plain-JS model object.
   */
  getAttributes: function getAttributes(opts, raw) {
    var options = (0, _lodash2.default)({
      session: false,
      props: false,
      derived: false,
      children: true,
      collections: true
    }, opts || {});
    var res = {};
    for (var item in this._definition) {
      var def = this._definition[item];
      if (options.session && def.session || options.props && !def.session) {
        var val = raw ? this._values[item] : this[item];
        if (typeof val === 'undefined') {
          val = (0, _lodash8.default)(def, 'default');
        }
        if (typeof val !== 'undefined') {
          res[item] = val;
        }
      }
    }
    if (options.derived) {
      for (var item in this._derived) {
        res[item] = this[item];
      }
    }
    if (options.children) {
      for (var child in this._children) {
        if (this[child].getAttributes) {
          res[child] = this[child].getAttributes(options, raw);
        }
      }
    }
    if (options.collections) {
      for (var coll in this._collections) {
        res[coll] = this[coll].models;
      }
    }
    return res;
  },

  /**
   * Parses the server response into a format which Ampersand Models
   * expect. Called when collection is initialized.
   * @method parse
   * @memberof JSONAPIModel
   * @instance
   * @override
   * @param {Object} data - The data received from the server.
   * @returns {Object} The transformed model.
   */
  parse: function parse(data) {

    // If this comes from a collection, there won't be a data property.
    // If it comes from querying the model API directly, it will.
    if (!data || !data.data && !data.id) {
      return {};
    }

    var model = data.data ? data.data : data;

    /** The attributes on the model. */
    var attributes = model.attributes;

    // The ID is outside of the other attributes.
    attributes.id = model.id;
    attributes.type = model.type;

    // We have to remember this so that we can parse the children
    this._attrs = attributes;

    return attributes;
  },

  /**
   * Saves a model to the persistence layer by delegating to
   * ampersand-sync.
   * @method save
   * @memberof JSONAPIModel
   * @instance
   * @override
   * @param {String|Object} key - If a string: the property of the model
   *                              to change. If an object: the
   *                              properties of the model to change as
   *                              `{key: value}`
   * @param {*|Object} val - If `key` is a string: the value of the
   *                         property to change. If `key` is an object:
   *                         method options as described under `opts`.
   * @param {Object|undefined} opts - Options to be used by `save` and
   *                                  shared with `ampersand-sync`. If
   *                                  `key` is an object, this parameter
   *                                  is ignored.
   * @returns {Object} An XHR object.
   */
  save: function save(key, val, opts) {
    var _this = this;

    var options = {};
    var attrs = {};
    var method = '';
    var sync = null;

    function wrapError(model, modelOptions) {
      var error = modelOptions.error;
      modelOptions.error = function (resp) {
        if (error) {
          error(model, resp, modelOptions);
        }
        model.trigger('error', model, resp, modelOptions);
      };
    }

    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (key == null || (typeof key === 'undefined' ? 'undefined' : _typeof(key)) === 'object') {
      attrs = key;
      options = val;
    } else {
      attrs[key] = val;
      options = opts;
    }

    options = (0, _lodash2.default)({ validate: true }, options);

    // If we're not waiting and attributes exist, save acts as
    // `set(attr).save(null, opts)` with validation. Otherwise, check if
    // the model will be valid when the attributes, if any, are set.
    if (attrs && !options.wait) {
      if (!this.set(attrs, options)) {
        return false;
      }
    } else if (!this._validate(attrs, options)) {
      return false;
    }

    // After a successful server-side save, the client is (optionally)
    // updated with the server-side state.
    if (options.parse == null) {
      options.parse = true;
    }
    var success = options.success;
    options.success = function (resp) {
      var serverAttrs = _this.parse(resp, options);
      if (options.wait) {
        serverAttrs = (0, _lodash2.default)(attrs || {}, serverAttrs);
      }
      if ((0, _lodash6.default)(serverAttrs) && !_this.set(serverAttrs, options)) {
        return false;
      }
      if (success) {
        success(_this, resp, options);
      }
      _this.trigger('sync', _this, resp, options);
    };

    wrapError(this, options);

    method = this.isNew() ? 'create' : options.patch ? 'patch' : 'update';
    if (method === 'patch') {
      options.attrs = transformForPatch(this.serialize(), attrs);
    }
    // if we're waiting we haven't actually set our attributes yet so
    // we need to do make sure we send right data
    if (options.wait && method !== 'patch') {
      var clonedModel = new this.constructor(this.getAttributes({
        props: true
      }));
      clonedModel.set(attrs);

      options.attrs = clonedModel.serialize();
    }

    sync = this.sync(method, this, options);

    // Make the request available on the options object so it can be accessed
    // further down the line by `parse`, attached listeners, etc
    // Same thing is done for fetch and destroy
    options.xhr = sync;

    return sync;
  },

  /**
   * Serializes the model into a format which the JSON-API server
   * expects.
   * @method serialize
   * @memberof JSONAPIModel
   * @instance
   * @override
   * @returns {Object} The JSON-API-formatted model.
   */
  serialize: function serialize() {
    var _this2 = this;

    var res = this.getAttributes({ props: true }, true);
    var id = res.id;
    var relationships = {};

    (0, _lodash4.default)(this._children, function (value, key) {
      relationships[key] = {
        data: {
          id: _this2[key].id,
          type: _this2[key].type
        }
      };
    }, this);

    delete res.id;

    return {
      data: {
        id: id,
        type: this.type,
        attributes: res,
        relationships: relationships
      }
    };
  }
});

exports.default = JSONAPIModel;
