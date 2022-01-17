import * as THREE from 'three';
import game from './Game';
import world from './managers/WorldManager';
import player from './Player';
import { players, g, camera } from './globals';
import PlayerManager from './managers/PlayerManager';

import * as dat from 'dat.gui';
const gui = new dat.GUI();
gui.domElement.style.zIndex = '10';
console.log(gui.domElement);

let blockSize = 16;
const offset = {
    armY: -blockSize * 0.15,
    legY: -blockSize * 0.75,
}

gui.add(offset, 'armY', -blockSize * 0.5, blockSize * 0.5);
gui.add(offset, 'legY', -blockSize * 1, blockSize * 1);
globalThis.offset = offset;

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

    p.entity.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.skeleton.rotation.set(p.rot.x, p.rot.y, p.rot.z);
    p.neck.rotation.x = p.dir.y;

    let shift = blockSize / 8;

    let armOffsetY = offset.armY;
    let legOffsetY = offset.legY;
    let legOffsetZ = 0;
    
    let leftHip = p.leftHip;
    let rightHip = p.rightHip;

    let leftLeg = p.leftLeg;
    let rightLeg = p.rightLeg;

    // Sneaking animation
    if (p.sneaking) {

        //legOffsetY = -blockSize * 0.5;
        //legOffsetZ = blockSize * 0.5;

    	p.body.rotation.x = -Math.PI/8;

    	p.head.position.set(0, blockSize*0, 0);
    	p.body.position.set(0, -blockSize*0.55, shift);

    	leftLeg.position.set(-player.dim.legSize/2, -blockSize*0.45-blockSize*0.9+shift, shift*2);
    	rightLeg.position.set(player.dim.legSize/2, -blockSize*0.45-blockSize*0.9+shift, shift*2);

        p.leftArm.position.set(-5.45, -blockSize*0.45-shift, 0);
        p.rightArm.position.set(-0.55, -blockSize * 0.3-shift, 0);
    } else {
    	p.body.rotation.x = 0;

    	p.head.position.set(0, blockSize*0.175, 0);
    	p.body.position.set(0, -blockSize*0.45, 0);

    	leftLeg.position.set(-player.dim.legSize*0.5, -blockSize*0.45-blockSize*0.75, 0);
    	rightLeg.position.set(player.dim.armSize*0.5, -blockSize*0.45-blockSize*0.75, 0);

        p.leftArm.position.set(-5.45, -blockSize*0.45, 0);
        p.rightArm.position.set(-0.55, -blockSize * 0.3, 0);
    }
    
    

    // if (p.sneaking) {
    // 	legOffsetY += shift;
    // 	legOffsetZ += shift*2;
    // }
    let axis = new THREE.Vector3(1, 0, 0);
    let speed = p.sneaking ? g.delta*3 : g.delta*10;
    let maxRotation = p.sneaking ? Math.PI/6 : Math.PI/3;

    if (p.walking) { // Walking animation
        if (p.leftArm.rotation.x < -maxRotation) {
            p.extendBody = false;
        } else if (p.leftArm.rotation.x > maxRotation) {
            p.extendBody = true;
        }



        if (p.extendBody) {
            rotateAboutPoint(p.rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, speed)
            rotateAboutPoint(p.leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, -speed)

            rotateAboutPoint(rightHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, -speed)
            rotateAboutPoint(leftHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, speed)
        } else {
            rotateAboutPoint(p.rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, -speed)
            rotateAboutPoint(p.leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, speed)

            rotateAboutPoint(rightHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, speed)
            rotateAboutPoint(leftHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, -speed)
        }
    } else {
        rotateAboutPoint(p.rightArm, new THREE.Vector3(0, armOffsetY, 0), axis, Math.abs(p.rightArm.rotation.x) * Math.sign(-p.rightArm.rotation.x))
        rotateAboutPoint(p.leftArm, new THREE.Vector3(0, armOffsetY, 0), axis, Math.abs(p.leftArm.rotation.x) * Math.sign(-p.leftArm.rotation.x))

        rotateAboutPoint(rightHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, Math.abs(rightHip.rotation.x) * Math.sign(-rightHip.rotation.x))
        rotateAboutPoint(leftHip, new THREE.Vector3(0, legOffsetY, legOffsetZ), axis, Math.abs(leftHip.rotation.x) * Math.sign(-leftHip.rotation.x))
    }

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
                item_mesh.position.set(-3, -player.dim.armHeight / 2, -player.dim.armSize);
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

    p.nameTag.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));

    p.rightShoulder.rotation.x = (-Math.cos(p.punchingT * Math.PI * 2) + 1) / 2;
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
