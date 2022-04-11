# Autoput

Executionally transparent unrevocable-put hyperbee

## Example

```js
const writer = new Autoput()
writer.once('error', error => {
  console.error(error.message === 'VIOLATION')
})

await writer.put('0', 'a')
await writer.put('0', 'a*') // create violation
await writer.get('0') // trigger violation
```