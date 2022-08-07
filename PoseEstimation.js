/*
References:
- "Iterative Pose Estimation using Coplanar Feature Points"
  Denis Oberkampf, Daniel F. DeMenthon, Larry S. Davis
  http://www.cfar.umd.edu/~daniel/daniel_papersfordownload/CoplanarPts.pdf

//	https://github.com/jcmellado/js-aruco/blob/master/samples/debug-posit/debug-posit.html#L220
*/



class Posit
{
	constructor(modelSize, MarkerNormal,focalLength)
	{
		this.objectPoints = this.buildModel(modelSize);
		this.focalLength = focalLength;

		//	object space normal 
		this.objectNormal = [NaN,NaN,NaN];
			
		//	gr: directions between corners I think
		this.objectVectors = [];
		this.objectMatrix = [[],[],[]];

		this.init(MarkerNormal);
	}

	buildModel(modelSize)
	{
		//	gr: allow user to specify their own coords
		if ( Array.isArray(modelSize) )
		{
			if ( modelSize.length != 4 )
				throw `If providing model coordinates, they should be 4x3 [][]. ${modelSize.length}x${modelSize[0].length} provided`;
			return modelSize.slice();
		}
		var half = modelSize / 2.0;

		return [
			[-half,  half, 0.0],
			[ half,  half, 0.0],
			[ half, -half, 0.0],
			[-half, -half, 0.0] 
		];
	};

	init(MarkerNormal)
	{
		var np = this.objectPoints.length;
		let vectors = [];
		let n = [];
		let len = 0.0;
		let row = 2;

		for ( let i = 0; i < np; ++ i)
		{
			this.objectVectors[i] = 
			[
				this.objectPoints[i][0] - this.objectPoints[0][0],
				this.objectPoints[i][1] - this.objectPoints[0][1],
				this.objectPoints[i][2] - this.objectPoints[0][2]
			];

			vectors[i] = 
			[
				this.objectVectors[i][0],
				this.objectVectors[i][1],
				this.objectVectors[i][2]
			];
		}

		//	gr: I think this is just finding cross products, 
		//		and length (for normalising) to get a normal
		while(0.0 === len)
		{
			n[0] = this.objectVectors[1][1] * this.objectVectors[row][2] -
			this.objectVectors[1][2] * this.objectVectors[row][1];
			
			n[1] = this.objectVectors[1][2] * this.objectVectors[row][0] -
			this.objectVectors[1][0] * this.objectVectors[row][2];
			
			n[2] = this.objectVectors[1][0] * this.objectVectors[row][1] -
			this.objectVectors[1][1] * this.objectVectors[row][0];

			len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);

			++ row;
		}

		for ( let i=0;	i<3;	i++)
		{
			//	normalising
			this.objectNormal[i] = n[i] / len;
		}
		
		if ( MarkerNormal )
		{
			console.log(`Marker normal provided (${MarkerNormal}) compared to calculated; ${this.objectNormal}`);
			this.objectNormal = [0,1,0];
		}

		pseudoInverse(vectors, np, this.objectMatrix);
	};


	pose(imagePoints)
	{
		var posRotation1 = [[],[],[]], posRotation2 = [[],[],[]], posTranslation = [],
		  rotation1 = [[],[],[]], rotation2 = [[],[],[]], translation1 = [], translation2 = [],
		  error1, error2, valid1, valid2, i, j;

		//	this calcs rotation & translation... without generating a matrix
		//	but our homography matrix is basically the same thing...
		this.pos(imagePoints, posRotation1, posRotation2, posTranslation);

		valid1 = this.isValid(posRotation1, posTranslation);
		if (valid1)
		{
			error1 = this.iterate(imagePoints, posRotation1, posTranslation, rotation1, translation1);
		}
		else
		{
			error1 = {euclidean: -1.0, pixels: -1, maximum: -1.0};
		}

		valid2 = this.isValid(posRotation2, posTranslation);
		if (valid2)
		{
			error2 = this.iterate(imagePoints, posRotation2, posTranslation, rotation2, translation2);
		}
		else
		{
			error2 = {euclidean: -1.0, pixels: -1, maximum: -1.0};
		}

		for (i = 0; i < 3; ++ i)
		{
			for (j = 0; j < 3; ++ j)
			{
				if (valid1)
				{
					translation1[i] -= rotation1[i][j] * this.objectPoints[0][j];
				}
				if (valid2)
				{
					translation2[i] -= rotation2[i][j] * this.objectPoints[0][j];
				}
			}
		}

		return error1.euclidean < error2.euclidean?
			new Pose_t(error1.pixels, rotation1, translation1, error2.pixels, rotation2, translation2):
			new Pose_t(error2.pixels, rotation2, translation2, error1.pixels, rotation1, translation1);
	};

	pos(imagePoints, rotation1, rotation2, translation)
	{
		var np = this.objectPoints.length,
		i0 = [], j0 = [], ivec = [], jvec = [], row1 = [], row2 = [], row3 = [],
		i0i0, j0j0, i0j0, delta, q, lambda, mu, scale, i, j;

		//	get vectors in image-marker space (all relative to corner[0])
		let imageVectors = [];
		for ( let i=0;	i<imagePoints.length;	i++)
		{
			imageVectors[i] = 
			[
				imagePoints[i].x - imagePoints[0].x,
				imagePoints[i].y - imagePoints[0].y
			];
		}

	  //i0 and j0
	  for ( let i = 0; i < 3; ++ i){
		i0[i] = 0.0;
		j0[i] = 0.0;
		for (j = 0; j < np; ++ j){
		  i0[i] += this.objectMatrix[i][j] * imageVectors[j][0];
		  j0[i] += this.objectMatrix[i][j] * imageVectors[j][1];
		}
	  }

		//	magnitude/length squared of scale from image to object?
		i0i0 = i0[0] * i0[0] + i0[1] * i0[1] + i0[2] * i0[2];
		j0j0 = j0[0] * j0[0] + j0[1] * j0[1] + j0[2] * j0[2];
		i0j0 = i0[0] * j0[0] + i0[1] * j0[1] + i0[2] * j0[2];

	  //Lambda and mu
	  delta = (j0j0 - i0i0) * (j0j0 - i0i0) + 4.0 * (i0j0 * i0j0);
	  
	  if (j0j0 - i0i0 >= 0.0){
		q = (j0j0 - i0i0 + Math.sqrt(delta) ) / 2.0;
	  }else{
		q = (j0j0 - i0i0 - Math.sqrt(delta) ) / 2.0;
	  }
	  
	  if (q >= 0.0){
		lambda = Math.sqrt(q);
		if (0.0 === lambda){
		  mu = 0.0;
		}else{
		  mu = -i0j0 / lambda;
		}
	  }else{
		lambda = Math.sqrt( -(i0j0 * i0j0) / q);
		if (0.0 === lambda){
		  mu = Math.sqrt(i0i0 - j0j0);
		}else{
		  mu = -i0j0 / lambda;
		}
	  }

	  //First rotation
	  for (i = 0; i < 3; ++ i)
	  {
		ivec[i] = i0[i] + lambda * this.objectNormal[i];
		jvec[i] = j0[i] + mu * this.objectNormal[i];
	  }
	  
	  scale = Math.sqrt(ivec[0] * ivec[0] + ivec[1] * ivec[1] + ivec[2] * ivec[2]);
	  
	  for ( let i = 0; i < 3; ++ i)
	  {
		row1[i] = ivec[i] / scale;
		row2[i] = jvec[i] / scale;
	  }
	  
	  row3[0] = row1[1] * row2[2] - row1[2] * row2[1];
	  row3[1] = row1[2] * row2[0] - row1[0] * row2[2];
	  row3[2] = row1[0] * row2[1] - row1[1] * row2[0];

	  for ( let i = 0; i < 3; ++ i)
	  {
		rotation1[0][i] = row1[i];
		rotation1[1][i] = row2[i];
		rotation1[2][i] = row3[i];
	  }

	  //Second rotation
	  for ( let i = 0; i < 3; ++ i)
	  {
		ivec[i] = i0[i] - lambda * this.objectNormal[i];
		jvec[i] = j0[i] - mu * this.objectNormal[i];
	  }
	  
	  for ( let i = 0; i < 3; ++ i)
	  {
		row1[i] = ivec[i] / scale;
		row2[i] = jvec[i] / scale;
	  }
	  
	  row3[0] = row1[1] * row2[2] - row1[2] * row2[1];
	  row3[1] = row1[2] * row2[0] - row1[0] * row2[2];
	  row3[2] = row1[0] * row2[1] - row1[1] * row2[0];
	  
	  for ( let i = 0; i < 3; ++ i)
	  {
		rotation2[0][i] = row1[i];
		rotation2[1][i] = row2[i];
		rotation2[2][i] = row3[i];
	  }

	  //Translation
	  translation[0] = imagePoints[0].x / scale;
	  translation[1] = imagePoints[0].y / scale;
	  translation[2] = this.focalLength / scale;
	}

	isValid(rotation, translation)
	{
		var np = this.objectPoints.length, zmin = Infinity, zi;

		//	project to z
		let PlaneIndex = 2;
		
		for ( let i=0; i < np; ++ i)
		{
			zi = translation[PlaneIndex] +
			(rotation[PlaneIndex][0] * this.objectVectors[i][0] +
			rotation[PlaneIndex][1] * this.objectVectors[i][1] +
			rotation[PlaneIndex][2] * this.objectVectors[i][2]);
		
			if (zi < zmin)
			{
				zmin = zi;
			}
		}

		return zmin >= 0.0;
	}


	iterate(imagePoints, posRotation, posTranslation, rotation, translation)
	{
	  var np = this.objectPoints.length,
		  oldSopImagePoints = [], sopImagePoints = [],
		  rotation1 = [[],[],[]], rotation2 = [[],[],[]],
		  translation1 = [], translation2 = [],
		  converged = false, iteration = 0,
		  oldImageDifference, imageDifference, factor,
		  error, error1, error2, delta, i, j;

	  for (i = 0; i < np; ++ i){
		oldSopImagePoints[i] = {x: imagePoints[i].x,
								y: imagePoints[i].y};
	  }
	  
	  for (i = 0; i < 3; ++ i){
		for (j = 0; j < 3; ++ j){
		  rotation[i][j] = posRotation[i][j];
		}
		translation[i] = posTranslation[i];
	  }

	  for (i = 0; i < np; ++ i){
		factor = 0.0;
		for (j = 0; j < 3; ++ j){
		  factor += this.objectVectors[i][j] * rotation[2][j] / translation[2];
		}
		sopImagePoints[i] = {x: (1.0 + factor) * imagePoints[i].x,
							 y: (1.0 + factor) * imagePoints[i].y};
	  }

	  imageDifference = 0.0;
	  
	  for (i = 0; i < np; ++ i){
		imageDifference += Math.abs(sopImagePoints[i].x - oldSopImagePoints[i].x);
		imageDifference += Math.abs(sopImagePoints[i].y - oldSopImagePoints[i].y);
	  }

	  for (i = 0; i < 3; ++ i){
		translation1[i] = translation[i] -
		  (rotation[i][0] * this.objectPoints[0][0] +
		   rotation[i][1] * this.objectPoints[0][1] +
		   rotation[i][2] * this.objectPoints[0][2]);
	  }
	  
	  error = error1 = this.error(imagePoints, rotation, translation1);

	  //Convergence
	  converged = (0.0 === error1.pixels) || (imageDifference < 0.01);
	  
	  while( iteration ++ < 100 && !converged ){
	  
		for (i = 0; i < np; ++ i){
		  oldSopImagePoints[i].x = sopImagePoints[i].x;
		  oldSopImagePoints[i].y = sopImagePoints[i].y;
		}

		this.pos(sopImagePoints, rotation1, rotation2, translation);

		//	matrix multiply the object positions to get image coords back
		for (i = 0; i < 3; ++ i)
		{
			translation1[i] = translation[i] -
			(rotation1[i][0] * this.objectPoints[0][0] +
			 rotation1[i][1] * this.objectPoints[0][1] +
			 rotation1[i][2] * this.objectPoints[0][2]);
			
			translation2[i] = translation[i] -
			(rotation2[i][0] * this.objectPoints[0][0] +
			 rotation2[i][1] * this.objectPoints[0][1] +
			 rotation2[i][2] * this.objectPoints[0][2]);
		}

		error1 = this.error(imagePoints, rotation1, translation1);
		error2 = this.error(imagePoints, rotation2, translation2);

		if ( (error1.euclidean >= 0.0) && (error2.euclidean >= 0.0) ){
		  if (error2.euclidean < error1.euclidean){
			error = error2;
			for (i = 0; i < 3; ++ i){
			  for (j = 0; j < 3; ++ j){
				rotation[i][j] = rotation2[i][j];
			  }
			}
		  }else{
			error = error1;
			for (i = 0; i < 3; ++ i){
			  for (j = 0; j < 3; ++ j){
				rotation[i][j] = rotation1[i][j];
			  }
			}
		  }
		}

		if ( (error1.euclidean < 0.0) && (error2.euclidean >= 0.0) )
		{
			error = error2;
			for (i = 0; i < 3; ++ i)
			{
				for (j = 0; j < 3; ++ j)
				{
					rotation[i][j] = rotation2[i][j];
				}
			}
		}
		
		if ( (error2.euclidean < 0.0) && (error1.euclidean >= 0.0) )
		{
			error = error1;
			for (i = 0; i < 3; ++ i)
			{
				for (j = 0; j < 3; ++ j)
				{
					rotation[i][j] = rotation1[i][j];
				}
			}
		}

		for (i = 0; i < np; ++ i)
		{
			factor = 0.0;
			for (j = 0; j < 3; ++ j)
			{
				factor += this.objectVectors[i][j] * rotation[2][j] / translation[2];
			}
			sopImagePoints[i].x = (1.0 + factor) * imagePoints[i].x;
			sopImagePoints[i].y = (1.0 + factor) * imagePoints[i].y;
		}

		oldImageDifference = imageDifference;
		imageDifference = 0.0;
		
		for (i = 0; i < np; ++ i)
		{
			imageDifference += Math.abs(sopImagePoints[i].x - oldSopImagePoints[i].x);
			imageDifference += Math.abs(sopImagePoints[i].y - oldSopImagePoints[i].y);
		}

		delta = Math.abs(imageDifference - oldImageDifference);

		converged = (0.0 === error.pixels) || (delta < 0.01);
	  }
	  
	  return error;
	};


	error(imagePoints, rotation, translation)
	{
	  var np = this.objectPoints.length,
		  move = [], projection = [], errorvec = [],
		  euclidean = 0.0, pixels = 0.0, maximum = 0.0,
		  i, j, k;

	  if ( !this.isValid(rotation, translation) ){
		return {euclidean: -1.0, pixels: -1, maximum: -1.0};
	  }
	  
	  for (i = 0; i < np; ++ i){
		move[i] = [];
		for (j = 0; j < 3; ++ j){
		  move[i][j] = translation[j];
		}
	  }
	  
	  for (i = 0; i < np; ++ i){
		for (j = 0; j < 3; ++ j){
		  for (k = 0; k < 3; ++ k){
			move[i][j] += rotation[j][k] * this.objectPoints[i][k];
		  }
		}
	  }

	  for (i = 0; i < np; ++ i)
	  {
		projection[i] = [];
		for (j = 0; j < 2; ++ j)
		{
		  projection[i][j] = this.focalLength * move[i][j] / move[i][2];
		}
	  }
	  
	  for (i = 0; i < np; ++ i){
		errorvec[i] = [projection[i][0] - imagePoints[i].x,
					   projection[i][1] - imagePoints[i].y];
	  }

	  for (i = 0; i < np; ++ i){
		euclidean += Math.sqrt(errorvec[i][0] * errorvec[i][0] +
							   errorvec[i][1] * errorvec[i][1]);
						   
		pixels += Math.abs( Math.round(projection[i][0]) - Math.round(imagePoints[i].x) ) +
				  Math.abs( Math.round(projection[i][1]) - Math.round(imagePoints[i].y) );
				  
		if (Math.abs(errorvec[i][0]) > maximum){
		  maximum = Math.abs(errorvec[i][0]);
		}
		if (Math.abs(errorvec[i][1]) > maximum){
		  maximum = Math.abs(errorvec[i][1]);
		}
	  }

	  return {euclidean: euclidean / np, pixels: pixels, maximum: maximum};
	};
}






function pseudoInverse(a, n, b)
{
  var w = [], v = [[],[],[]], s = [[],[],[]],
      wmax = 0.0, cn = 0,
      i, j, k;

  svdcmp(a, n, 3, w, v);

  for (i = 0; i < 3; ++ i){
    if (w[i] > wmax){
      wmax = w[i];
    }
  }

  wmax *= 0.01;

  for (i = 0; i < 3; ++ i){
    if (w[i] < wmax){
      w[i] = 0.0;
    }
  }

  for (j = 0; j < 3; ++ j){
    if (0.0 === w[j]){
      ++ cn;
      for (k = j; k < 2; ++ k){
        for (i = 0; i < n; ++ i){
          a[i][k] = a[i][k + 1];
        }
        for (i = 0; i < 3; ++ i){
          v[i][k] = v[i][k + 1];
        }
      }
    }
  }

  for (j = 0; j < 2; ++ j){
    if (0.0 === w[j]){
      w[j] = w[j + 1];
    }
  }

  for (i = 0; i < 3; ++ i){
    for (j = 0; j < 3 - cn; ++ j){
      s[i][j] = v[i][j] / w[j];
    }
  }
  
  for (i = 0; i < 3; ++ i){
    for (j = 0; j < n; ++ j){
      b[i][j] = 0.0;
      for (k = 0; k < 3 - cn; ++ k){
        b[i][j] += s[i][k] * a[j][k];
      }
    }
  }
};


class Pose_t
{
	constructor(error1, rotation1, translation1, error2, rotation2, translation2)
	{
		this.bestError = error1;
		this.bestRotation = rotation1;
		this.bestTranslation = translation1;
		this.alternativeError = error2;
		this.alternativeRotation = rotation2;
		this.alternativeTranslation = translation2;
	};
}



function svdcmp(a, m, n, w, v)
{
  var flag, i, its, j, jj, k, l, nm,
      anorm = 0.0, c, f, g = 0.0, h, s, scale = 0.0, x, y, z, rv1 = [];
      
  //Householder reduction to bidiagonal form
  for (i = 0; i < n; ++ i){
    l = i + 1;
    rv1[i] = scale * g;
    g = s = scale = 0.0;
    if (i < m){
      for (k = i; k < m; ++ k){
        scale += Math.abs( a[k][i] );
      }
      if (0.0 !== scale){
        for (k = i; k < m; ++ k){
          a[k][i] /= scale;
          s += a[k][i] * a[k][i];
        }
        f = a[i][i];
        g = -sign( Math.sqrt(s), f );
        h = f * g - s;
        a[i][i] = f - g;
        for (j = l; j < n; ++ j){
          for (s = 0.0, k = i; k < m; ++ k){
            s += a[k][i] * a[k][j];
          }
          f = s / h;
          for (k = i; k < m; ++ k){
            a[k][j] += f * a[k][i];
          }
        }
        for (k = i; k < m; ++ k){
          a[k][i] *= scale;
        }
      }
    }
    w[i] = scale * g;
    g = s = scale = 0.0;
    if ( (i < m) && (i !== n - 1) ){
      for (k = l; k < n; ++ k){
        scale += Math.abs( a[i][k] );
      }
      if (0.0 !== scale){
        for (k = l; k < n; ++ k){
          a[i][k] /= scale;
          s += a[i][k] * a[i][k];
        }
        f = a[i][l];
        g = -sign( Math.sqrt(s), f );
        h = f * g - s;
        a[i][l] = f - g;
        for (k = l; k < n; ++ k){
          rv1[k] = a[i][k] / h;
        }
        for (j = l; j < m; ++ j){
          for (s = 0.0, k = l; k < n; ++ k){
            s += a[j][k] * a[i][k];
          }
          for (k = l; k < n; ++ k){
            a[j][k] += s * rv1[k];
          }
        }
        for (k = l; k < n; ++ k){
          a[i][k] *= scale;
        }
      }
    }
    anorm = Math.max(anorm, ( Math.abs( w[i] ) + Math.abs( rv1[i] ) ) );
  }

  //Acumulation of right-hand transformation
  for (i = n - 1; i >= 0; -- i){
    if (i < n - 1){
      if (0.0 !== g){
        for (j = l; j < n; ++ j){
          v[j][i] = ( a[i][j] / a[i][l] ) / g;
        }
        for (j = l; j < n; ++ j){
          for (s = 0.0, k = l; k < n; ++ k){
            s += a[i][k] * v[k][j];
          }
          for (k = l; k < n; ++ k){
            v[k][j] += s * v[k][i];
          }
        }
      }
      for (j = l; j < n; ++ j){
        v[i][j] = v[j][i] = 0.0;
      }
    }
    v[i][i] = 1.0;
    g = rv1[i];
    l = i;
  }

  //Acumulation of left-hand transformation
  for (i = Math.min(n, m) - 1; i >= 0; -- i){
    l = i + 1;
    g = w[i];
    for (j = l; j < n; ++ j){
      a[i][j] = 0.0;
    }
    if (0.0 !== g){
      g = 1.0 / g;
      for (j = l; j < n; ++ j){
        for (s = 0.0, k = l; k < m; ++ k){
          s += a[k][i] * a[k][j];
        }
        f = (s / a[i][i]) * g;
        for (k = i; k < m; ++ k){
          a[k][j] += f * a[k][i];
        }
      }
      for (j = i; j < m; ++ j){
        a[j][i] *= g;
      }
    }else{
        for (j = i; j < m; ++ j){
          a[j][i] = 0.0;
        }
    }
    ++ a[i][i];
  }

  //Diagonalization of the bidiagonal form
  for (k = n - 1; k >= 0; -- k){
    for (its = 1; its <= 30; ++ its){
      flag = true;
      for (l = k; l >= 0; -- l){
        nm = l - 1;
        if ( Math.abs( rv1[l] ) + anorm === anorm ){
          flag = false;
          break;
        }
        if ( Math.abs( w[nm] ) + anorm === anorm ){
          break;
        }
      }
      if (flag){
        c = 0.0;
        s = 1.0;
        for (i = l; i <= k; ++ i){
          f = s * rv1[i];
          if ( Math.abs(f) + anorm === anorm ){
            break;
          }
          g = w[i];
          h = pythag(f, g);
          w[i] = h;
          h = 1.0 / h;
          c = g * h;
          s = -f * h;
          for (j = 1; j <= m; ++ j){
            y = a[j][nm];
            z = a[j][i];
            a[j][nm] = y * c + z * s;
            a[j][i] = z * c - y * s;
          }
        }
      }

      //Convergence
      z = w[k];
      if (l === k){
        if (z < 0.0){
          w[k] = -z;
          for (j = 0; j < n; ++ j){
            v[j][k] = -v[j][k];
          }
        }
        break;
      }

      if (30 === its){
        return false;
      }

      //Shift from bottom 2-by-2 minor
      x = w[l];
      nm = k - 1;
      y = w[nm];
      g = rv1[nm];
      h = rv1[k];
      f = ( (y - z) * (y + z) + (g - h) * (g + h) ) / (2.0 * h * y);
      g = pythag( f, 1.0 );
      f = ( (x - z) * (x + z) + h * ( (y / (f + sign(g, f) ) ) - h) ) / x;

      //Next QR transformation
      c = s = 1.0;
      for (j = l; j <= nm; ++ j){
        i = j + 1;
        g = rv1[i];
        y = w[i];
        h = s * g;
        g = c * g;
        z = pythag(f, h);
        rv1[j] = z;
        c = f / z;
        s = h / z;
        f = x * c + g * s;
        g = g * c - x * s;
        h = y * s;
        y *= c;
        for (jj = 0; jj < n; ++ jj){
          x = v[jj][j];
          z = v[jj][i];
          v[jj][j] = x * c + z * s;
          v[jj][i] = z * c - x * s;
        }
        z = pythag(f, h);
        w[j] = z;
        if (0.0 !== z){
          z = 1.0 / z;
          c = f * z;
          s = h * z;
        }
        f = c * g + s * y;
        x = c * y - s * g;
        for (jj = 0; jj < m; ++ jj){
          y = a[jj][j];
          z = a[jj][i];
          a[jj][j] = y * c + z * s;
          a[jj][i] = z * c - y * s;
        }
      }
      rv1[l] = 0.0;
      rv1[k] = f;
      w[k] = x;
    }
  }

  return true;
};

function pythag(a, b)
{
  var at = Math.abs(a), bt = Math.abs(b), ct;

  if (at > bt){
    ct = bt / at;
    return at * Math.sqrt(1.0 + ct * ct);
  }
    
  if (0.0 === bt){
    return 0.0;
  }

  ct = at / bt;
  return bt * Math.sqrt(1.0 + ct * ct);
};

function sign(a, b)
{
  return b >= 0.0? Math.abs(a): -Math.abs(a);
}


export function GetPoseEstimation(MarkerSizeOrCoords,MarkerNormal,FocalLength,Corners)
{
	let PositInstance = new Posit(MarkerSizeOrCoords,MarkerNormal,FocalLength);
	const Pose = PositInstance.pose(Corners);
	return Pose;
}
