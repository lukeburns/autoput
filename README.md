[Executionally transparent](https://github.com/pfrazee/vitra/blob/master/docs/whitepaper.pdf) [irrevocable](https://github.com/lukeburns/autoput/blob/main/index.js#L7-L14) (put-once / no-delete) [Hyperbee](https://github.com/hypercore-protocol/hyperbee)

## Example

```js
const writer = new Autoput()
console.log('contract address:', writer.address) // hyp1pj62xwrnalug2q5qpu4z5hunxhzptk2j46ftajje3phf4a4wp95rqq0lyw7

writer.once('error', error => {
  console.error(error.message === 'VIOLATION')
})

await writer.put('0', 'a')
await writer.put('0', 'a*') // create violation
await writer.get('0') // trigger violation
```
