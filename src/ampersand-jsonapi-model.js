/**
 * @file {@link JSONAPIModel} module: a base model extending
 * AmpersandModel that parses data received from JSONAPI-compatible
 * servers.
 * @module classes/json-api-model
 * @see JSONAPIModel
 * @see module:classes/json-api-collection
 */

import AmpersandModel from 'ampersand-model';
import ajaxConfig from 'ampersand-jsonapi-ajaxconfig';
import assign from 'lodash.assign';
import forEach from 'lodash.foreach';
import isObject from 'lodash.isobject';
import result from 'lodash.result';
import transform from 'lodash.transform';
import keys from 'lodash.keys';
import intersection from 'lodash.intersection';
import reduce from 'lodash.reduce';

function transformForPatch(obj, attrs) {

  if (!isObject(obj)) {
    return obj;
  }

  const attrKeys = keys(attrs);

  // If all attributes are within the object
  if (intersection(keys(obj), attrKeys).length === attrKeys.length) {
    // return the subset of passed-in attrs
    return reduce(attrKeys, function(redux, attrKey) {
      redux[attrKey] = attrs[attrKey];
      return redux;
    }, {});
  }
  return transform(obj, function(res, val, key) {
    // run transformForPatch on the next level
    res[key] = transformForPatch(val, attrs);
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
const JSONAPIModel = AmpersandModel.extend(ajaxConfig, {

  /**
   * Initializes collections as type defined in model definition.
   * @method _initCollections
   * @memberof JSONAPIModel
   * @instance
   * @private
   * @returns {Object} An instance of the collection type
   */
  _initCollections() {
    if (!this._collections) {
      return;
    }

    for (const coll in this._collections) {
      this[coll] = new this._collections[coll](
        null,
        {parent: this, parse: true}
      );
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
  _initChildren() {
    if (!this._children) {
      return;
    }
    for (const child in this._children) {
      const childAttrs = this._attrs && this._attrs[child] ?
        this._attrs[child] : {};
      this[child] = new this._children[child](
        childAttrs,
        {parent: this, parse: true}
      );
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
  getAttributes(opts, raw) {
    const options = assign({
      session: false,
      props: false,
      derived: false,
      children: true,
      collections: true,
    }, opts || {});
    const res = {};
    for (const item in this._definition) {
      const def = this._definition[item];
      if ((options.session && def.session) || (options.props && !def.session)) {
        let val = (raw) ? this._values[item] : this[item];
        if (typeof val === 'undefined') {
          val = result(def, 'default');
        }
        if (typeof val !== 'undefined') {
          res[item] = val;
        }
      }
    }
    if (options.derived) {
      for (const item in this._derived) {
        res[item] = this[item];
      }
    }
    if (options.children) {
      for (const child in this._children) {
        if (this[child].getAttributes) {
          res[child] = this[child].getAttributes(options, raw);
        }
      }
    }
    if (options.collections) {
      for (const coll in this._collections) {
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
  parse(data) {

    // If this comes from a collection, there won't be a data property.
    // If it comes from querying the model API directly, it will.
    if (!data || (!data.data && !data.id)) {
      return {};
    }

    const model = data.data ? data.data : data;

    /** The attributes on the model. */
    const attributes = model.attributes;

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
  save(key, val, opts) {
    let options = {};
    let attrs = {};
    let method = '';
    let sync = null;

    function wrapError(model, modelOptions) {
      const error = modelOptions.error;
      modelOptions.error = function(resp) {
        if (error) {
          error(model, resp, modelOptions);
        }
        model.trigger('error', model, resp, modelOptions);
      };
    }

    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (key == null || typeof key === 'object') {
      attrs = key;
      options = val;
    }
    else {
      attrs[key] = val;
      options = opts;
    }

    options = assign({validate: true}, options);

    // If we're not waiting and attributes exist, save acts as
    // `set(attr).save(null, opts)` with validation. Otherwise, check if
    // the model will be valid when the attributes, if any, are set.
    if (attrs && !options.wait) {
      if (!this.set(attrs, options)) {
        return false;
      }
    }
    else if (!this._validate(attrs, options)) {
      return false;
    }

    // After a successful server-side save, the client is (optionally)
    // updated with the server-side state.
    if (options.parse == null) {
      options.parse = true;
    }
    const success = options.success;
    options.success = resp => {
      let serverAttrs = this.parse(resp, options);
      if (options.wait) {
        serverAttrs = assign(attrs || {}, serverAttrs);
      }
      if (isObject(serverAttrs) && !this.set(serverAttrs, options)) {
        return false;
      }
      if (success) {
        success(this, resp, options);
      }
      this.trigger('sync', this, resp, options);
    };

    wrapError(this, options);

    method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
    if (method === 'patch') {
      options.attrs = transformForPatch(
        this.serialize(),
        attrs
      );

    }
    // if we're waiting we haven't actually set our attributes yet so
    // we need to do make sure we send right data
    if (options.wait && method !== 'patch') {
      const clonedModel = new this.constructor(this.getAttributes({
        props: true,
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
  serialize() {

    const res = this.getAttributes({
      props: true,
      children: false,
      collections: false,
    }, true);
    const id = res.id;
    const relationships = {};

    forEach(this._children, (value, key) => {
      relationships[key] = {
        data: {
          id: this[key].id,
          type: this[key].type,
        },
      };
    }, this);

    delete res.id;

    return {
      data: {
        id,
        type: this.type,
        attributes: res,
        relationships,
      },
    };
  },
});

export default JSONAPIModel;
