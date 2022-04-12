[Executionally transparent](https://github.com/pfrazee/vitra/blob/master/docs/whitepaper.pdf) [irrevocable](https://github.com/lukeburns/autoput/blob/main/index.js#L7-L14) (put-once / no-delete) [Hyperbee](https://github.com/hypercore-protocol/hyperbee)

## Example

```js
const writer = new Autoput()
console.log('contract address:', writer.address) // hyp1pj62xwrnalug2q5qpu4z5hunxhzptk2j46ftajje3phf4a4wp95rqq0lyw7
console.log('public key:', writer.key) // 659293c28da0d5467b515641893f4e9e52a7ce7f675feb83c70680e3b1cfbf08

writer.once('error', error => {
  console.error(error.message === 'VIOLATION')
})

await writer.put('0', 'a')
await writer.put('0', 'a*') // create violation
await writer.get('0') // trigger violation
```
