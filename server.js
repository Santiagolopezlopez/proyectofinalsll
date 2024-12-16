const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const fs= require ('fs');
const PDFDocument= require ('pdfkit');

require('dotenv').config();

app.use(bodyParser.urlencoded({ extended: true }));
  // Configuración de la sesión
  app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: false,
  }));
  
  app.use(express.urlencoded({ extended: true }));
  

// Servir archivos estáticos (HTML)
app.use(express.static(path.join(__dirname, 'public')));
// Configurar conexión a MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,       // Host desde .env
  user: process.env.DB_USER,       // Usuario desde .env
  password: process.env.DB_PASS,   // Contraseña desde .env
  database: process.env.DB_NAME    // Nombre de la base de datos desde .env
});

  connection.connect(err => {
    if (err) {
      console.error('Error conectando a MySQL:', err);
      return;
    }
    console.log('Conexión exitosa a MySQL');
  });
  
function requireLogin(req, res, next) {
    if (!req.session.userId) {
      return res.redirect('/login.html');
    }
    next();
  }
function requireRole(role) {
    return (req, res, next) => {
        if (req.session.userId && req.session.userId.tipo_usuario === role) {
            next();
        } else {
            res.status(403).send('Acceso denegado');
        }
    };
}
// Ruta para la página principal
app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Registro de usuario
app.post('/registrar', async (req, res) => {
    const { nombre_usuario, password, codigo_acceso } = req.body;

    const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';
    connection.query(query, [codigo_acceso], (err, results) => {
        if (err || results.length === 0) {
            return res.send('Código de acceso inválido');
        }
    const tipo_usuario = results[0].tipo_usuario;
    const passwordHash = bcrypt.hashSync(password, 10);

  const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuarios) VALUES (?, ?, ?)';
    connection.query(insertUser, [nombre_usuario, passwordHash, tipo_usuario], (err) => {
      if (err) return res.send('Error al registrar el usuario.');
      res.redirect('/login.html');
       });
    });
});
// Iniciar sesión
app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;
  
    connection.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', 
      [nombre_usuario], async (err, results) => {
      if (err || results.length === 0) {
        return res.send('Usuario no encontrado.');
      }
  
      const user = results[0];
      const match = bcrypt.compareSync(password, user.password_hash);
      if (match) {

        console.log('match ok');
        console.log(user);
        // Almacenar la información del usuario en la sesión
        req.session.userId = {
            id: user.id,
            nombre_usuario: user.nombre_usuario,
            tipo_usuario: user.tipo_usuarios // Aquí se establece el tipo de usuario en la sesión
        };
       console.log(req.session.userId);
    
       res.redirect('/');
      } else {
        res.send('Contraseña incorrecta.');
      }
    });
  });
  
// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
    res.json({ tipo_usuario: req.session.userId.tipo_usuario });
});
// Cerrar sesión
  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
  });
// Ruta para que solo admin pueda ver todos los usuarios
app.get('/ver-usuarios', requireLogin, requireRole('administrador'), (req, res) => {
    const query = 'SELECT * FROM usuarios';
    connection.query(query, (err, results) => {
        if (err) return res.send('Error al obtener usuarios');
        let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        
      </head>
      <body>
        <h2>Lista de usuarios</h1>
        <table>
            <tr>
              <th>Nombre de usuario</th>
              <th>Tipo de usuario</th>
            </tr> `;
          
      
    //Recorrer resultados para generar filas de la tabla 
      results.forEach(user => {
      html += `
        <tr> 
          <td>${user.nombre_usuario}</td>
          <td>${user.tipo_usuarios}</td>
        </tr> `;  
      });  
      html += `
           </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
    res.send(html);

  });
});
app.get('/ver-invitados', requireLogin, requireRole('administrador'), (req, res) => {
  const query = 'SELECT * FROM invitados';
  connection.query(query, (err, results) => {
      if (err) return res.send('Error al obtener usuarios');
      let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      
    </head>
    <body>
      <h2>Lista de invitados</h1>
      <table>
          <tr>
            <th>Nombre/th>
            <th>Apellido</th>
            <th>Empresa</th>
            <th>Motivo</th>
          </tr> `;
        
    
  //Recorrer resultados para generar filas de la tabla 
    results.forEach(user => {
    html += `
      <tr> 
        <td>${user.nombre}</td>
        <td>${user.apellido}</td>
        <td>${user.empresa}</td>
        <td>${user.motivo}</td>
      </tr> `;  
    });  
    html += `
         </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;
  res.send(html);

});
});
app.post('/eliminar_usuario', requireLogin, requireRole('administrador'), (req, res) => {
    const {id} = req.body;
  
    const query = 'DELETE FROM usuarios WHERE id=(?)';
    connection.query(query, [id], (err, result) => {
      if (err) {
        return res.send('Error al eliminar al usuario.');
      }
      res.send(`Usuario eliminado de la base de datos.`);
    });
  });  
// Ruta para guardar datos en la base de datos
  app.post('/submit-data', requireLogin, (req, res) => {
    const { name, color , estado, funcionalidad } = req.body;
  
    const query = 'INSERT INTO materiales (nombre, color, estado, funcionalidad) VALUES (?, ?, ?, ?)';
    connection.query(query, [name, color, estado, funcionalidad], (err, result) => {
      if (err) {
        return res.send('Error al guardar los datos en la base de datos.');
      }
      res.send(`Material ${name} guardado en la base de datos.`);
    });
  });

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/materiales', requireLogin, requireRole ('empleado'), (req, res) => {
    connection.query('SELECT * FROM materiales', (err, results) => {
      if (err) {
        return res.send('Error al obtener los datos.');
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Materiales</title>
        </head>
        <body>
          <h1>Materiales en Stock</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>color</th>
                <th>estado</th>
                <th>funcionalidad</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(material => {
        html += `
          <tr>
            <td>${material.nombre}</td>
            <td>${material.color}</td>
            <td>${material.estado}</td>
            <td>${material.funcionalidad}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
  });
  app.get('/pertenenciastotales', requireLogin, requireRole ('administrador'), (req, res) => {
    connection.query('SELECT * FROM materiales_maquinas_view', (err, results) => {
      if (err) {
        return res.send('Error al obtener los datos.');
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Materiales totales</title>
        </head>
        <body>
          <h1>Total de pertenencias</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre material</th>
                <th>color material</th>
                <th>estado material</th>
                <th>funcionalidad material</th>
                <th>nombre maquina</th>
                <th>descripcion maquina</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(material => {
        html += `
          <tr>
            <td>${material.material_nombre}</td>
            <td>${material.material_color}</td>
            <td>${material.material_estado}</td>
            <td>${material.material_funcionalidad}</td>
            <td>${material.maquina_nombre}</td>
            <td>${material.maquina_descripcion}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
  });
  app.get('/buscar', (req, res) => {
    const query = req.query.query;
    const sql = `SELECT nombre_usuario FROM usuarios WHERE nombre_usuario LIKE ?`;
    connection.query(sql, [`%${query}%`], (err, results) => {
      if (err) throw err;
      res.json(results);
    });
  });

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('excelFile'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { nombre, descripcion } = row;
    const sql = `INSERT INTO maquinas (nombre, descripcion) VALUES (?, ?)`;
    connection.query(sql, [nombre, descripcion], err => {
      if (err) throw err;
    });
  });

  res.send('<h1>Archivo cargado y datos guardados</h1><a href="/equipos.html">Volver</a>');
});
app.get('/download', (req, res) => {
  const sql = `SELECT * FROM maquinas`;
  connection.query(sql, (err, results) => {
    if (err) throw err;

    const worksheet = xlsx.utils.json_to_sheet(results);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'maquinas');

    const filePath = path.join(__dirname, 'uploads', 'maquinas.xlsx');
    xlsx.writeFile(workbook, filePath);
    res.download(filePath, 'maquinas.xlsx');
  });
});
app.get('/downloadpdf', requireLogin, requireRole('administrador'), (req, res) => {
  const sql = `SELECT * FROM maquinas`;
  connection.query(sql, (err, results) => {
    if (err) {
      console.error("Error al consultar la base de datos:", err);
      return res.status(500).send('Error al obtener los datos.');
    }

    // Crear el documento PDF
    const doc = new PDFDocument();
    const filePath = path.join(__dirname, 'uploads', 'maquinas.pdf');

    // Crear el archivo PDF en el sistema de archivos
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Título
    doc.fontSize(16).text('Máquinas', { align: 'center' }).moveDown();

    // Subtítulo
    doc.fontSize(12).text('Control de maquinaria', { align: 'center' }).moveDown(2);

    // Cabecera de la tabla
    doc.fontSize(10).text('Máquinas disponibles:', { align: 'left' }).moveDown();

    // Filas de la tabla
    results.forEach((maquina, index) => {
      const row = `${index + 1}. ${maquina.nombre} - ${maquina.descripcion}`;
      doc.text(row, { align: 'left' }).moveDown(0.5);
    });

    // Finalizar el documento
    doc.end();

    // Cuando el archivo se haya generado, permitir la descarga
    stream.on('finish', () => {
      res.download(filePath, 'maquinas.pdf', (err) => {
        if (err) {
          console.error('Error al descargar el archivo:', err);
          res.status(500).send('Error al descargar el archivo.');
        } else {
          // Eliminar el archivo temporal después de la descarga
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error al eliminar el archivo:', unlinkErr);
          });
        }
      });
    });
  });
});
  app.post('/eliminar_materiales', requireLogin, requireRole('administrador'), (req, res) => {
    const {nombre} = req.body;
  
    const query = 'DELETE FROM materiales WHERE nombre=(?)';
    connection.query(query, [nombre], (err, result) => {
      if (err) {
        return res.send('Error al eliminar el material.');
      }
      res.send(`Material eliminado de la base de datos.`);
    });
  });

  // Ruta para ordenar materiales por frecuencia cardiaca
app.get('/ordenar-materiales', requireLogin,requireRole('empleado'), (req, res) => {
    const query = 'SELECT * FROM materiales ORDER BY nombre ASC';
  
    connection.query(query, (err, results) => {
      if (err) {
        return res.send('Error al obtener los datos.');
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Materiales Ordenados</title>
        </head>
        <body>
          <h1>Materiales Ordenados alfabeticamente</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>color</th>
                <th>estado</th>
                <th>funcionalidad</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(material => {
        html += `
          <tr>
            <td>${material.nombre}</td>
            <td>${material.color}</td>
            <td>${material.estado}</td>
            <td>${material.funcionalidad}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
  });
  // Ruta para insertar un nuevo médico
app.post('/insertar-invitado', requireLogin,requireRole('administrador'), (req, res) => {
    const { nombre, apellido, empresa, motivo } = req.body;
    const query = 'INSERT INTO invitados (nombre, apellido, empresa, motivo) VALUES (?, ?, ?, ?)';
  
    connection.query(query, [nombre, apellido, empresa, motivo], (err, result) => {
      if (err) {
        return res.send('Error al insertar el invitado.');
      }
      res.send(`Invitado ${nombre} guardado exitosamente.`);
    });
  });


// Configuración del servidor
const port = process.env.PORT || 3001; // Puerto desde .env o valor por defecto

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
