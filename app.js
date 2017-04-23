var express = require('express')
var bparse = require('body-parser')
var mongo = require('mongodb')
var sanitize = require('express-mongo-sanitize')
var _ = require('underscore')


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
app.use(bparse.urlencoded({extended:true}))

app.use(bparse.json())
function mongof(func, errfunction, req, res){
    mongo.connect(url, function(err,db){
        if (err){
            errfunction(err)
            res.status(500).send("Could not connect to database.")
        }
        func(db, req, res)
    });
}

app.use(sanitize({replaceWith: '_'}))

/*Read Movies -> get a listing of all movies.*/
function readMovies(db, req, res){ 
    var reviews = undefined;
    var listing = db.collection("listing")
    var print_reviews=0
    if( req.query.reviews && req.query.reviews.toLowerCase() === 'true'){
        var reviews = db.collection("reviews")
        print_reviews = 1
    }//send back all of title, year and actor
    //don't send id back.
    
    var query = null;
    if (print_reviews){
        query=listing.find({},{"mtitle":1, "mactor":1, "myear":1,"reviews":1, "_id":1}).toArray()
    }else{
        query=listing.find({},{"mtitle":1, "mactor":1, "myear":1, "_id":1}).toArray()
    }
    query.then(function(docs,err){
        if (err){
            resFunc(err, res, db, 500, "Internal Server Error")
            return
        }else{
            if(print_reviews){
                console.log("Here")
                //test using promises without co functions or yield statements.
                var query2 = reviews.find({}).toArray()
                query2.then(function(r,e){
                    r.forEach(function(each, idx, arr){
                        docs.forEach(function(every){
                        if (every.reviews){
                        every.reviews.forEach(function(make_reviews,idx2, arr2){
                                if (make_reviews == each._id){
                                    docs.reviews = _.without(docs.reviews, make_reviews)
                                    docs.reviews.push(each)
                            
                                }
                                if(idx == (arr.length -1)  && idx2 == (arr2.length-1)){
                                    console.log(docs)
                                    resFunc(err, res, db, 200, docs)
                                }                            
                            })
                        }
                        })

                    })
                
                })
            }else{
                resFunc(err, res, db, 200, docs)
            }
                
        }
    })
}

app.get("/movies", function(req, res){
    mongof(readMovies, errfunc, req, res)
})
//

/* Read Movie -> from the query string, get several movie titles and ids */
//needs updates: if reviews=true, pass it all back
function readMovie(db, req, res){
    if (!req.query.title){
        resFunc(undefined, res, db, 400, "No query.")
        return;
    }
    var movie_name = req.query['title']
    var collection = db.collection("listing")
    //send back title where text matches.
    //don't send back actor
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
    var idx =req.query['mid']
    var collection = db.collection("listing")
    collection.findOne({ "_id":new mongo.ObjectId(idx)},
        {"mtitle":1,"myear":1,"mactor":1,"_id":1},
        function(err, r){
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
        collection.find({"mtitle":candidate.mtitle,"myear":candidate.myear}).toArray(function(err,notunique){
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
    rt.mtitle = candidate.title
    if(!rt.mtitle){
        console.log('one')
        return false;
    }
    rt.myear = candidate.year
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
        //new sanitization code...
        var sanitized = sanitize.sanitize(each, {replaceWith: '_'})
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
    var candidate = req.query["mid"]
    var collection = db.collection("listing")
    collection.findOne({ "_id":new mongo.ObjectId(candidate)}, function(err, r){
        if (err){
            resFunc(err,res,db, 500, "Internal Server error.")
        } else{
            if (r === null){
                resFunc(err, res, db, 403, "Cannot delete, document doesn't exist.")
            } else{
                var reviews = db.collection("reviews")
                if(candidate.reviews.length){
                reviews.removeMany({"_id":{"$or":candidate.reviews},
                                    function(err, r){
                                        if(err){
                        resFunc(err,res,db, 500, "Internal Server error.")
                                        }
                                    }})
                }
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

//create a review, requires movies id.
app.post("/createreview", function(req,res){
    mongof(createReview, errfunc, req, res)
})

function createReview(db, req, res){
    var searches = {id: req.body.mid, myear:req.body.year, mtitle:req.body.title}
    //make sure adding new criteria actually exists
    if (!(  searches.id || ( searches.myear && searches.mtitle))){
        resFunc(null, res, db, 500, "No effective movie search.")
        return;
    }
    
    var nreview = checkReview(req)
    if (nreview.err){
        
        resFunc(null, res, db, nreview.rcode, nreview.err)
        return;
    }
    var cursor = null;
    var listing = db.collection("listing")
    if (searches.id){
        cursor = listing.find({"_id":new mongo.ObjectId(searches.id)})
    }else{
        cursor = listing.find({"myear":String(searches.myear), "mtitle":searches.mtitle})
    }
    cursor.toArray(function(err, docs){
        if(err){
            resFunc(err,res,db, 500, "Internal Server error.")
        }else{
            if (docs.length===0){
                console.log("no film")
                resFunc(err,res,db, 204, "No film matching description. Cannot add.")
                return
            }
            //set the film revieweds id so it can be found.
            nreview.film = docs[0]._id.toString()
            var reviews = db.collection("reviews")
            //insert the review.
            reviews.insertOne(nreview, function( err, dc){
                if(err){
                    resFunc(err,res,db, 500, "Internal Server error.")
                }else{
                    console.log(typeof(dc))
                    console.log(dc)
                    //find the first matching document.
                    //add the successfully added document id to it.
                    docs[0].reviews.push(String(dc.insertedId.toString()))
                    //the update the film so it has the id on its end.
                    listing.updateOne({"_id": docs[0]._id},
                    {"$set":{"reviews":docs[0].reviews}}, function(err,movieobj){
                        if(err){
                            resFunc(err,res,db, 500, "Internal Server error.")
                        }else{
                            console.log("here")
                            //send along the review.
                            resFunc(err,res,db,200, JSON.stringify(dc.ops))
                        }
                    })
                }
            })
        }
        
    })
    
}

function checkReview(req){
    rt = {}
    rt.author = req.body.author;
    rt.rating = Number(req.body.rating);
    if (! (rt.author && rt.rating)){
        rt.err = "Review value not defined."
        rt.rcode= 400
    }else if ( rt.rating < 1 || rt.rating > 5){
        rt.err = "Review rating less than one or greater than five."
        rt.rcode = 400
    }
    if(!req.body.text){
        rt.text =""
    }else{
        rt.text = req.body.text.slice(0,150)
    }
    return rt;
}



//delete a review, requires just object id.
app.delete("/removereview", function(req,res){
    mongof(removeReview,errfunc, req, res)
})
 
function removeReview(db, req, res){
    var searches = {id: req.body.mid}
    //make sure adding new criteria actually exists
    if (!(  searches.id )){
        resFunc(null, res, db, 400, "No effective movie search.")
        return;
    }
    
    var reviews = db.collection("review")
    var listing = db.collection("listing")
    
    reviews.findOne({"_id":new mongo.ObjectId(searches.id)}, function(err, doc){
        if(!doc){
            resFunc(err,res,db, 204, "No review with this id.")
        }
        listing.findOne({"_id":new mongo.ObjectId(doc.film)}, function(err, mv){
            if(err){
                resFunc(err,res,db, 500, "Internal Server error.")
                return;
            }
            mv.reviews.remove(searches.id)
            listing.updateOne({"_id": new mongo.ObjectId(doc.film)}, {$set:{"reviews":mv.reviews}}, function(err,r){
                if(err){
                    resFunc(err,res,db, 500, "Internal Server error.")
                    return;
                }
            })
        })
    })
    reviews.removeOne({"_id":new mongo.ObjectId(searches.id)}, function(err, r){
        if(err){
            resFunc(err,res,db, 500, "Internal Server error.")
        }else{
            resFunc(err,res,db, 200, "Removed film")
        }
    })
    
}
    
//film review by id.
app.get("/reviewbyid", function(req, res){
    mongof(reviewById, errfunc, req, res)
})

function removeReview(db, req, res){
    var searches = {id: req.body.mid}
    //make sure adding new criteria actually exists
    if (!(  searches.id )){
        resFunc(null, res, db, 400, "No effective movie search.")
        return;
    }
    
    var reviews = db.collection("review")
    reviews.findOne({"_id": new mongo.ObjectId(searches.id)}, function(err,r){
        if(err){
            resFunc(null, res, db, 500, "Internal Server error")
            return;
        }
        if(!r){
            resFunc(null, res, db, 204, "No review with that id")
            return;
        }
    })
}
/*Start SERVER!*/    
app.listen(PORT, function(e){
    if(e){
        console.log(e)
    }else{
        console.log("listening")
    }
})