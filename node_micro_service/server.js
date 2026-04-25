const express = require('express');
const app = express();
const fs = require('fs')

// using this if we put /<anyfile name under this webapp file it will reflect the file directly no need to write separate endpoint explicitely>
app.use(express.static('webapp'))


app.get('/', function(req,res){
    res.send('Hello World');
})

// 
// app.get('/employee', function(req,res){
    
//     const contentdata = fs.readFileSync(__dirname + "/webapp/data.json", "utf-8");
//     res.send(contentdata);

// })



app.listen(process.env.PORT ||4040,()=>{
    console.log('Server started at http://localhost:4040')
});