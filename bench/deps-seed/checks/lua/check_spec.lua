local add = require('check')

describe('check', function()
  it('adds', function()
    assert.equal(4, add(2, 2))
  end)
end)
