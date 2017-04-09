var express = require('express')
var bparse = require('body-parser')
var mongo = require('mongodb')
var sanitize = require('sanitizer')
//turn this into a vaulted secret
var url ="mongodb://admin:movies@ds155490.mlab.com:55490/movies"
var PORT = 3000
var app=express()

function resFunc(e, res, d, stts, message){
    if(e){
        console.log(e)
    }
    res.status(stts).send(message)
    d.close()
}

function errfunc(e){
    console.log(e)
}

//set up middleware json parser.
app.use(bparse.json())

function mongof(func, errf, req, res){
    mongo.connect(url, function(err,db){
        if (err){
            errf(err)
            res.status(500).send("Could not connect to database.")
        }
        func(db, req, res)
    });
}

/*Read Movies -> get a listing of all movies.*/
function readMovies(db, req, res){
    var collection = db.collection("listing")
    collection.find({},{"mtitle":1, "myear":1, "mactor":1, "_id":0}).toArray(function(err, docs){
        if (err){
            resFunc(err, res, db, 500, "Internal Server Error")
        }else{
            resFunc(err, res, db, 200, docs)
        }
    })
}

app.get("/movies", function(req, res){
    mongof(readMovies, errfunc, req, res)
})
//

/* Read Movie -> from the query string, get several movie titles and ids */
function readMovie(db, req, res){
    if (!req.query.title){
        resFunc(undefined, res, db, 400, "No query.")
        return;
    }
    var movie_name = sanitize.escape(sanitize.sanitize(req.query['title']))
    var collection = db.collection("listing")
    collection.createIndex({"mtitle": "text"}, function(err, result){
        if(err){
            resFunc(err,res,db,500, "Internal Server Error")
    }   else{
        collection.find({"$text": {"$search":movie_name, "$caseSensitive":false}}, {"mtitle":1, "myear":1, "mactor":1, "_id":1}).toArray(function(err, docs){
            if (err){
                resFunc(err, res, db, 500, "Internal Server Error")
            }else{
                if(docs.length){
                    resFunc(err, res, db, 200, docs)
                } else{
                    resFunc(err, res, db, 204, "No movie found.")
                }
            }

        })}
    })
}

app.get("/movietitle", function(req, res){
    mongof(readMovie, errfunc, req, res)
})

/*Get a movie by it's id.*/
function readMid(db, req, res){
    console.log(req.query)
    console.log("HERE")
    if (!(req.query.mid)){
        resFunc(undefined, res, db, 400, "No query.")
        return;
    }
    var idx =sanitize.escape(sanitize.sanitize(req.query['mid']))
    var collection = db.collection("listing")
    collection.findOne({ "_id":new mongo.ObjectId(idx)}, function(err, r){
        if (err){
            resFunc(err, res, db, 500, "Internal server error.")
        }else{
            if(r){
                resFunc(err, res, db, 200, r)
            } else{
                resFunc(err, res, db, 204, "No movie found.")
            }
        }
    })
}

app.get("/movieid", function(req,res){
    mongof(readMid, errfunc, req, res)
})                     
//

app.post("/addmovie", function(req, res){
    mongof(createMovie, errfunc, req, res)
})

function createMovie(db, req, res){
    var candidate = req.body
    candidate = checkAddInfo(candidate)
    if (candidate){
        var collection = db.collection("listing")
        collection.find(candidate).toArray(function(err,notunique){
            if (notunique.length!==0){
                resFunc(undefined, res, db, 403, "Bad request. Object exists.")
            } else{
                collection.insertOne(candidate, function(err, r){
                    if (err){
                        resFunc(err, res, db, 500, "Internal Server Error.")
                    }else{
                        resFunc(err, res, db, 200, "Added object to database.")
                    }
                })
            }
        })
    } else{
        resFunc(undefined, res, db, 400, "Bad request. Needs a title, year, actors. Actors must have 3 actors.")
    }
    
}

function checkAddInfo(candidate){
    var rt = {}
    rt.mtitle = sanitize.sanitize(candidate.title)
    if(!rt.mtitle){
        console.log('one')
        return false;
    }
    rt.myear = sanitize.sanitize(candidate.year)
    if (!rt.myear){
        console.log('two')
        return false;
    }
    console.log()
    if(!candidate.actors){
        console.log('three')
        return false;
    }
    //dirty check for an array
    if( !candidate.actors.length ){
        return false;
    }
    rt.mactors=[]
    candidate.actors.forEach(function(each){
        var sanitized = sanitize.sanitize(each)
        if(sanitized.length){
            rt.mactors.push(each)
        }
    })
    if (rt.mactors.length<3){
        return false;
    }
    return rt;
}

function deleteMovie(db, req, res){
    if (!req.query.mid){
        resFunc(undefined, res, db, 400, "No query.")
        return;
    }
    var candidate = sanitize.escape(sanitize.sanitize((req.query["mid"])))
    var collection = db.collection("listing")
    collection.findOne({ "_id":new mongo.ObjectId(candidate)}, function(err, r){
        if (err){
            resFunc(err,res,db, 500, "Internal Server error.")
        } else{
            if (r === null){
                resFunc(err, res, db, 403, "Cannot delete, document doesn't exist.")
            } else{
                collection.removeOne({"_id":new mongo.ObjectId(candidate)}, function(err, r){
                    if (err){
                        resFunc(err,res,db, 500, "Internal Server error.")
                    } else{
                        resFunc(err, res, db, 200, "Object Deleted.")
                    }
                })
            }
        }

    })
}

app.delete("/deletemovie", function(req, res){
    mongof(deleteMovie, errfunc, req, res)
})

app.listen(PORT, function(){
    console.log("Listening!")
})