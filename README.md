# ampersand-jsonapi-model

AmpersandJSONAPIModel is a [JSON-API](http://jsonapi.org/)-compatible
extension of the
[AmpersandJS Model](https://github.com/AmpersandJS/ampersand-model).

It achieves this JSON-API compatibility by overriding select methods within
ampersand-model and adding appropriate HTTP headers to requests.

## Installing

```
npm install ampersand-jsonapi-model
```

## API Reference

Except as described below, AmpersandJSONAPIModel has the same interface as
[AmpersandModel](https://github.com/AmpersandJS/ampersand-model) and
[AmpersandState](https://github.com/AmpersandJS/ampersand-state).

To ensure this, AmpersandJSONAPIModel passes all tests for AmpersandModel
(version 6.0.2).

The following methods have been overridden:

### getAttributes model.getAttributes([options, raw])

This adds additional options for returning `children` and `collections` along
with the standard `session`, `props`, and `derived options.

### parse model.parse(data)

This has been augmented to parse JSON-API formatted data: specifically a
format in which model attributes are nested within the structure
`{ data: attributes: {} }`.

### save model.save([attributes], [options])

This has been augmented in order to handle the special structure and additional
relationship data included in saving to a JSON-API-compatible server.

### serialize model.serialize()

This has been augmented in order to serialize data into the correct format
expected by JSON-API.
