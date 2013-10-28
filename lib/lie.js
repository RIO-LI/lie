    /*

#Promises

This file is both legal JavaScript and markdown, so if there are a few quirks like that open comment up there, that is why.

This code is from a [promise library called 'lie'][lie]. You can install it from npm with `npm install lie`.

The intent of this code is to implement promises in a straightforward way that is as close to the spec as possible while also being readable and performance. The version of promises that ended up being settled on is (as of 10/27/13) a simple constructor which takes as its sole argument a function with 2 arguments, 'fulfill' and 'reject'. Gone are the earlier notions of promises and deferred objects (which is good a I kept trying to spell deferred with 2 Fs and 1 R).

In case you don't know how a promise works a quick review, if you need more Domenic Denicola did a [good post][domenic] on promises.

- a *promise* is a placeholder for a value that you don't have yet but you plan to have latter, it is equivalent to the 'maybe monads' in other languages.
- a promise starts off as pending but then *resolves* into a value or an error.
- you access the value or error with the promises sole method which is `.then`. It takes two arguments, a function called with the value if it succeeds and a function called with an error, for this reason promise and promise like things are sometimes called *thenable* objects.
- the then method is also a promise, they are promises for the value that they success or failure handlers return, if the promise failed but the failure handler returns a value then the promises is turned into a successful one, if the promise fulfills but there is an error thrown in the success handler it turns into a failed promise.
- you don't have to call with both arguments you can omit either one (i.e. call with one function and omit the failure one, or call with false/null/undefined/etc and the failure one). In this case the promise returned by the call to then will pass the value to the omitted function through.
- one a promise is resolved it is resolved, it can only happen once.
- if the success handler or the promise return a promise as a value, then instead of resolving as that promise it resolves to the value that promise resolves to. (aka `Promise(function(resolve){return promise2;});` is the same this as just returning promise2).

Anyway onward to the code.

First off we want our code to be strict, this might look like it's enabling global strict mode (bad). But in node it doesn't work that way, and our build system will wrap this in a closure for the browser.

```javascript
*/
'use strict';
/*
```

An efficient promise implementation needs a way to resolve a function asynchronously, and you want to do it as fast as possible, I've covered how to do efficient low latency async resolving in a few [other] [blog-1] [posts][blog-2].


```javascript
*/
var immediate = require('immediate');
/*
```

Now for the actual constructor

```javascript
*/
function Promise(resolver) {
/*
```

Right remember when I said I wanted to get it as close as possible to the spec, this is the one place I didn't this trick allows me to call the constructor from code without using 'new'. I do this because you can't chain a function called with the new operator very easily. You can't do `new promise(func).then(other stuff)` you have to do `(new promise(func)).then(other stuff)` so when the spec comes out I'll probably be having a little script that says `function promise(f){return new Promise(f);}` on most of my pages.

```javascript
*/
     if (!(this instanceof Promise)) {
        return new Promise(resolver);
    }
/*
```

We start by creating two queues, one for functions to call if our promise resolves successfully and the other for functions we need to call if it isn't successful, we have have a 'resolved' variable so we cn tell if we are pending or not.

```javascript
*/
    var sucessQueue = [];
    var failureQueue = [];
    var resolved = false;
/*
```

Our one and only method then is defined, and it checks if the aforementioned resolved variable is falsy, and if it is we return the pending function with the two arguments and if it is truthy we return it as a function.

Later on we will see that we redefine this variable to be a function.  In my head it is clearer to only use one variable for both the state and the function that is used when the state changes, others might not.

```javascript
*/
    this.then = function(onFulfilled, onRejected) {
        if(resolved){
            return resolved(onFulfilled, onRejected);
        } else {
            return pending(onFulfilled, onRejected);
        }
    };
/*
```

The pending function actually returns a new promise and you can see the syntax of how it's called with the nested function inside function.

```javascript
*/
    function pending(onFulfilled, onRejected){
        return new Promise(function(success,failure){
/*
```

We more or less do the same thing twice in this function,ones for each argument.

First if the `onFulfilled` function is given (i.e. called as `.then(func)` or as `.then(func,func)`). we put into the successQueue and object with

- a callback: a function to call the value on.
- a resolve handler, a function to call with the value if things go well
- a reject handler, a function to call with any errors that happen.

if it is not called with an `onFulfilled` function the callback is set to false and it is has `next` which is just how to resolve this promise.

```javascript
*/
            if(typeof onFulfilled === 'function'){
                sucessQueue.push({
                    resolve: success,
                    reject: failure,
                    callback:onFulfilled
                });
            }else{
                sucessQueue.push({
                    next: success,
                    callback:false
                });
            }
/*
```

Then we do the same thing for the `onRejected` handler.

```javascript
*/
            if(typeof onRejected === 'function'){
                failureQueue.push({
                    resolve: success,
                    reject: failure,
                    callback:onRejected
                });
            }else{
                failureQueue.push({
                    next: failure,
                    callback:false
                });
            }
        });
    }
/*
```

We save the current `this` value as a variable called `scope` this will come in handy in a bit if we need to give somebody this same promise we are building now.

This could be avoided by using 'function.prototype.bind', but it is unavailable in older version of Internet Explorer.

```javascript
*/
    var scope = this;
/*
```

This is the function we call when we want to transition the function from pending to resolved, it is called with two arguments, `success` which is true if the promise is being resolved successfully and false if it is being rejected, the second argument is the value it is being resolved with, or the reason it's being rejected.

```javascript
*/
    function resolve(success, value){
/*
```

If you remember from earlier we can only resolve it once, so if this is being called a seccond time then we need to nip that in the bud.

```javascript
*/
        if(resolved){
            return;
        }
/*
```

Here is where we redefine the variable resolved into a truthy value, it will be a function which handles calls to `then` from now on, it's called with the scope (remember thats the current promise we're creating), the value, and then we give it the number 0 if we succeeded and one if we failed, you'll see why we want it to have those values when we look at the createResolved function later.

In case you are don't know it's important to remember that in a function in JavaScript counts as `true` when it comes to conditionals.

You might wonder 

```javascript
*/
        resolved = createResolved(scope, value, success?0:1);
/*
```

Now we define the variable queue to be either successQueue or failureQueue depending on what happened and we set up the loop through it.

```javascript
*/
        var queue = success ? sucessQueue : failureQueue;
        var len = queue.length;
        var i = -1;
        while(++i < len) {
/*
```

so if this item in the queue has a callback we do something complicated which I'll get to in a minute, and if it doesn't but does have a next value we just call next with that value.  e.g if you go `var promise2 = promise(blah).then(null,func)` and it successfully resolves, then `next` is the function which resolves promise2.

back to what immediate does, what it does is call it's first argument with the rest of its arguments, in other words `immediate(a,b,c)` is the same as calling `immediate(function(){a(b,c);})`. In other words `execute` is being called with the callback, the value, the success function, and the reject function, you'll see what execute does in a bit.

```javascript
*/
            if (queue[i].callback) {
                immediate(execute,queue[i].callback, value, queue[i].resolve, queue[i].reject);
            }else if(queue[i].next){
                queue[i].next(value);
            }
        }
    }
/*
```

We now set up two functions which are just short hands for calling resolve with true or false value, these two functions where originally written as `var reject = resolve.bind(this,false);` and `var fulfill = resolve.bind(this,true);` but I had to change it as bind isn't available in older versions of IE.

In that state of affairs the resolve function didn't need to use the `scope` variable but could just pass `this`. Sometimes we have elegant code and Microsoft just shits all over it.

```javascript
*/
    function reject(reason){
        resolve(false,reason);
    }
    function fulfill(value){
        resolve(true,value);
    }
/*
```

Remember when I said we had to make sure if a a promise resolved with a promise, it was the value the promise resolved and not the promise which was given to the next thing? unwrap is the function which does that for us.

Back in my nice pre Microsoft version of the code fulfill was really `var fulfill = unwrap.bind(null,resolve.bind(this,true),reject);`

```javascript
*/
    function fulfillUnwrap(value){
        unwrap(fulfill, reject, value);
    }
/*
```

Now we actually call that resolver from way up in the arguments to this function.  We call it inside a try clause and if it fails we call the rejection handler.

```javascript
*/
    try{
        resolver(fulfillUnwrap,reject);
    }catch(e){
        reject(e);
    }
}
/*
```

That is the end of the Promise constructor, I now have a couple utility methods that didn’t depend on the closure. First being `unwrap` which takes a value, and if it's a promise calls the promise with the fulfill and reject functions it's given.  Otherwise we just call fulfill with it. 

```javascript
*/
function unwrap(fulfill, reject, value){
    if(value && typeof value.then==='function'){
        value.then(fulfill,reject);
    }else{
        fulfill(value);
    }
}
/*
```

This is the function which creates the function which handles calls to `.then` after it is resolved. What it does is it first figures out which of it's arguments corresponds to the state the promise is in (e.g. if it's successful grabs the first one, rejected grabs the second). 

If that argument isn't a function then we just return the original promise. This covers when `promise1` resolves into an error. `promise1.then(func);` doesn't do anything. if we were to call it as `promise1.then(null,func)` we would then triger the other clause which asynchronously executes the callback just like we did for the things in the queue in the 'resolve' function.

Instead of straight up returning an anonymous function we define it with a name and then return it, this can help in debugging. 

```javascript
*/
function createResolved(scope, value, whichArg) {
    function resolved() {
        var callback = arguments[whichArg];
        if (typeof callback !== 'function') {
            return scope;
        }else{
            return new Promise(function(resolve,reject){
                immediate(execute,callback,value,resolve,reject);
            });
        }
    }
    return resolved;
}
/*
```

Lastly we have the execute function which is pretty similar to what we did with the resolver function of calling it inside a try clause.

```javascript
*/
function execute(callback, value, resolve, reject) {
    try {
        unwrap(resolve,reject,callback(value));
    } catch (error) {
        reject(error);
    }
}
/*
```

this is [commonjs][cj] so we export stuff, I'm using [browerify][browserify] to make the browser version.

```javascript
*/
module.exports = Promise;
/*
```

fin

-Calvin W. Metcalf

[domenic]: http://domenic.me/2012/10/14/youre-missing-the-point-of-promises/
[lie]: https://github.com/calvinmetcalf/lie
[blog-1]: http://calvinmetcalf.com/post/61672207151/setimmediate-etc
[blog-2]: http://calvinmetcalf.com/post/61761231881/javascript-schedulers
[cj]: http://wiki.commonjs.org/wiki/CommonJS
[browserify]: https://github.com/substack/node-browserify
    */
