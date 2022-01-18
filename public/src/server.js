import * as THREE from 'three';
import game from './Game';
import world from './managers/WorldManager';
import player from './Player';
import { players, g, camera } from './globals';
import PlayerManager from './managers/PlayerManager';
import { clamp } from './lib/helper';

// Update server players
export function updatePlayers(serverPlayers) {
    for (let id in players) {
        let p = players[id];
        let p_ = serverPlayers[id];
        if (p.pos && p.rot && p_) {
            // Set new player location
            p.pos.set({ x: p_.pos.x, y: p_.pos.y, z: p_.pos.z });
            p.rot.set({ x: p_.rot.x, y: p_.rot.y, z: p_.rot.z });
            p.dir.set({ x: p_.dir.x, y: p_.dir.y, z: p_.dir.z });

            p.vel.set({ x: p_.vel.x, y: p_.vel.y, z: p_.vel.z });

            // Update player data
            if (p_.hp != p.hp) {
                p.heartBlink = game.tick.value;
                if (!p.lastHp || p_.hp > p.lastHp) {
                    p.lastHp = p.hp;
                }
            }
            p.hp = p_.hp;
            if (p.hp <= 0 && p.entity.visible) {
                p.entity.visible = false;
            } else if (p.hp > 0) {
                p.entity.visible = true;
            }

            // Update player armor
            PlayerManager.updatePlayerArmor(p, p_);

            // Update gamemode / operator
            if (p.mode != p_.mode || p.operator != p_.operator) {
                p.operator = p_.operator;
                PlayerManager.updateNameTag(p);
                PlayerManager.setPlayerGamemode(p, p_.mode);
            }

            // Update player hand if necessary
            let same = p.toolbar[p_.currSlot] && p_.toolbar[p_.currSlot] && p.toolbar[p_.currSlot].v == p_.toolbar[p_.currSlot].v && p.toolbar[p_.currSlot].class == p_.toolbar[p_.currSlot].class && p.toolbar[p_.currSlot].c == p_.toolbar[p_.currSlot].c;
            let bothExists = p.toolbar[p_.currSlot] == null && p_.toolbar[p_.currSlot] == null;
            if (p.currSlot != p_.currSlot || (!same && !bothExists)) {
                p.currSlot = p_.currSlot;

                let hand = p_.toolbar[p.currSlot];

                if (p.hand && p.hand.mesh) p.rightArm.remove(p.hand.mesh);
                if (hand && hand.c > 0) PlayerManager.updatePlayerHand(hand, p);
            }

            // Transfer data
            let transferredValues = (({ ping, toolbar, walking, sneaking, punching, blocking, fps }) => ({ ping, toolbar, walking, sneaking, punching, blocking, fps }))(p_);
            Object.assign(p, transferredValues)

            // Update player name if necessary (performance intensive)
            if (p.name != p_.name) {
                p.name = p_.name;

                PlayerManager.updateNameTag(p); // Update name tag
                PlayerManager.setPlayerGamemode(p, p.mode); // Set gamemode
            }
        }
    }
}

function updatePlayer(p) {
    let { blockSize } = world;
    
    let dim = player.dim;
    let {skin, leftArm, rightArm, leftLeg, rightLeg, leftHip, rightHip, headPivot, entity, skeleton, pos, rot, dir} = p;

    entity.position.set(pos.x, pos.y, pos.z); // Set player position

    p.neck.rotation.set(rot.x, rot.y, rot.z); // Set sideways head rotation

    // Rotate body towards the head
    let angleDiff = Math.abs(p.neck.quaternion.dot(p.wholeBody.quaternion));
    if (angleDiff < 0.92) {
        p.wholeBody.quaternion.slerp(p.neck.quaternion, g.delta*4);
    }

    if (p.walking) {
        let target = new THREE.Vector3(-p.vel.x, 0, -p.vel.z); // Target direction
        target.normalize();

        let bodyDir = new THREE.Vector3()
        p.wholeBody.getWorldDirection(bodyDir);

        bodyDir.normalize();
        let quaternion = new THREE.Quaternion().setFromUnitVectors(bodyDir, target); // Get rotation quaternion from current and target direction

        let targetQuaternion = p.wholeBody.clone(false); // TODO: OPTIMIZE
        targetQuaternion.applyQuaternion(quaternion); // Apply rotation quaternion to body

        p.wholeBody.quaternion.slerp(targetQuaternion.quaternion, g.delta*3); // Lerp body towards target quaternion
    }

    headPivot.rotation.x = dir.y * Math.PI/2; // Set up/down head rotation

    // Offsets
    let shift = 2; // blockSize / 8;
    let armOffsetY = 4; // blockSize * 0.25;
    let legOffsetY = 8; // blockSize * 0.5;
    let rightShoulderOffset = skin == "steve" ? dim.armSize * 3/2 : dim.armSize * 3/2 - 0.6;
    let leftShoulderOffset = skin == "steve" ? -6 : -5.45;

    // Sneaking animation
    if (p.sneaking) {

    	p.body.rotation.x = -Math.PI/8;

    	p.neck.position.set(0, -blockSize*0.25, 0);
    	p.body.position.set(0, -blockSize*0.55, shift);

    	leftHip.position.set(-dim.legSize/2, -blockSize*0.45-blockSize*0.9+shift, shift*2);
    	rightHip.position.set(dim.legSize/2, -blockSize*0.45-blockSize*0.9+shift, shift*2);

        p.leftShoulder.position.set(leftShoulderOffset, -blockSize*0.42-shift, blockSize*0.05);
        p.rightShoulder.position.set(rightShoulderOffset, -blockSize * 0.12-shift, 0);
    } else {
    	p.body.rotation.x = 0;

    	p.neck.position.set(0, -blockSize * 0.075, 0);
    	p.body.position.set(0, -blockSize*0.45, 0);

    	leftHip.position.set(-dim.legSize*0.5, -blockSize*0.45-blockSize*0.75, 0);
    	rightHip.position.set(dim.armSize*0.5, -blockSize*0.45-blockSize*0.75, 0);

        p.leftShoulder.position.set(leftShoulderOffset, -blockSize*0.45, 0);
        p.rightShoulder.position.set(rightShoulderOffset, -blockSize * 0.15, 0);
    }

    // Get magnitude of velocity
    let v = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    v = clamp(v, 0, 1);
    if (p.sneaking) v *= 2;

    // Set speed of animation based on velocity
    let axis = new THREE.Vector3(1, 0, 0);
    let speed = p.sneaking ? g.delta*3 : g.delta*10;
    let maxRotation = p.sneaking ? Math.PI/6 : Math.PI/3;
    speed *= v;
    maxRotation *= v;

    if (p.walking) { // Walking animation
        if (leftArm.rotation.x < -maxRotation) {
            p.extendBody = false;
        } else if (leftArm.rotation.x > maxRotation) {
            p.extendBody = true;
        }

        if (p.extendBody) {
            rotateAboutPoint(rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, speed)
            rotateAboutPoint(leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, -speed)

            rotateAboutPoint(rightLeg, new THREE.Vector3(0, legOffsetY, 0), axis, -speed)
            rotateAboutPoint(leftLeg, new THREE.Vector3(0, legOffsetY, 0), axis, speed)
        } else {
            rotateAboutPoint(rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, -speed)
            rotateAboutPoint(leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, speed)

            rotateAboutPoint(rightLeg, new THREE.Vector3(0, legOffsetY, 0), axis, speed)
            rotateAboutPoint(leftLeg, new THREE.Vector3(0, legOffsetY, 0), axis, -speed)
        }
    } else {
        rotateAboutPoint(rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, Math.abs(rightArm.rotation.x) * Math.sign(-rightArm.rotation.x))
        rotateAboutPoint(leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, Math.abs(leftArm.rotation.x) * Math.sign(-leftArm.rotation.x))

        rotateAboutPoint(rightLeg, new THREE.Vector3(0, legOffsetY, 0), axis, Math.abs(rightLeg.rotation.x) * Math.sign(-rightLeg.rotation.x))
        rotateAboutPoint(leftLeg, new THREE.Vector3(0, legOffsetY, 0), axis, Math.abs(leftLeg.rotation.x) * Math.sign(-leftLeg.rotation.x))
    }

    // Active hand item
    if (p.hand) {
        let hand = p.toolbar[p.currSlot];
        let item_mesh = p.hand.mesh;
        if (hand) {
            if (p.blocking) {
                item_mesh.position.set(-4, -2, -3);
                item_mesh.rotation.set(0, -Math.PI / 8, 0);
            } else if (hand.class == "item") {
                item_mesh.position.set(0, -4, -8);
                item_mesh.rotation.set(-Math.PI / 2 - Math.PI / 6, Math.PI / 2, 0);
            } else {
                item_mesh.position.set(-3, -dim.armHeight / 2, -dim.armSize);
                item_mesh.rotation.set(0, Math.PI / 4, 0);
            }
        }
    }


    // Punching animation
    if (p.punching) {
        p.punchingT += g.delta * 5;

        if (p.punchingT > 1)
            p.punchingT = 0
    } else {
        if (p.punchingT < 1) {
            p.punchingT += g.delta * 5;
        } else {
            p.punchingT = 1;
        }
    }

    // Update nametag rotation
    p.nameTag.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));

    if (p.sneaking) {
        p.leftShoulder.rotation.x = -Math.PI/16;
        p.rightShoulder.rotation.x = -Math.PI/16;
    } else {
        p.leftShoulder.rotation.x = 0;
        p.rightShoulder.rotation.x = 0;
    }

    p.rightShoulder.rotation.x += (-Math.cos(p.punchingT * Math.PI * 2) + 1) / 2;
    p.rightShoulder.rotation.z = Math.sin(p.punchingT * Math.PI * 2) / 2;
}

// Animate server players
export function animateServerPlayers() {
    for (let id in players) {
        let p = players[id];
        if (p.entity) {
            updatePlayer(p);
        }
    }
}

// Animate server entities
let throwables = ["ender_pearl", "fireball", "snowball", "egg"];

export function animateServerEntities(delta) {

    for (let id in world.entities) {
        let entity = world.entities[id]
        if (!entity.mesh) continue;

        if (throwables.includes(entity.name)) {
            entity.mesh.lookAt(player.position);
        } else if (entity.name != "arrow") {
            entity.mesh.rotation.y += delta; // Rotate entity around y axis

            let mesh = entity.mesh.children;

            if (entity.onObject) { // Animate server entities on the ground
                let offset = (Math.sin((Date.now() - entity.t + 500) / 1000 * (Math.PI))) * 2 - 2;
                if (entity.class == "item") {
                    let target = new THREE.Vector3(0, offset, 0);
                    mesh[1].position.lerp(target, delta * 10);
                    mesh[0].position.set(0, mesh[1].position.y, 0);
                } else if (entity.class = "block") {
                    let target = new THREE.Vector3(-2, 2 + offset, -2);
                    mesh[1].position.lerp(target, delta * 10);
                    mesh[0].position.set(0, mesh[1].position.y, 0);
                }

            } else {
                mesh[1].position.y = 0;
            }
        } else if (entity.name == "arrow") {
            let dir = new THREE.Vector3(entity.vel.x, entity.vel.y, entity.vel.z).normalize();
            let mx = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
            let qt = new THREE.Quaternion().setFromRotationMatrix(mx);
            entity.qt.slerp(qt, delta);
            entity.mesh.setRotationFromQuaternion(qt);
        }

        entity.mesh.position.lerp(entity.pos, delta * 10);
    }
}

// Rotate object around a 3D point
function rotateAboutPoint(obj, point, axis, theta, pointIsWorld) {
    pointIsWorld = (pointIsWorld === undefined) ? false : pointIsWorld;

    if (pointIsWorld) {
        obj.parent.localToWorld(obj.position); // compensate for world coordinate
    }

    obj.position.sub(point); // remove the offset
    obj.position.applyAxisAngle(axis, theta); // rotate the POSITION
    obj.position.add(point); // re-add the offset

    if (pointIsWorld) {
        obj.parent.worldToLocal(obj.position); // undo world coordinates compensation
    }

    obj.rotateOnAxis(axis, theta); // rotate the OBJECT
}