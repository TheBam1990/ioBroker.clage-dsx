##Verbinung mittels JavaScript

Da der DLH mit https arbeitet muss hier zunächst ein https agent initialisiert werden mit 

const instance = axios.create({
httpsAgent: new https.Agent({  
rejectUnauthorized: false
})
});


##Abfragen der werte

const resp =instance.get(URL,daten {

auth:{

username: benutzer,

password: password,
}
});

Als Beispiel:
const resp =instance.get("https://"+URL+"/devices/status/" {

auth:{

username: admin,

password: admin,
}
});